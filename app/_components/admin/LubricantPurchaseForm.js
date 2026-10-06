'use client';

import { useActionState, useEffect, useRef, useState } from 'react';

import { createLubricantPurchase } from '@/app/_lib/actions';
import SubmitButton from '@/app/_components/ui/SubmitButton';
import FormMessage from '@/app/_components/ui/FormMessage';
import Toast from '@/app/_components/ui/Toast';
import Dialog from '@/app/_components/ui/Dialog';
import SupplierSelect from '@/app/_components/admin/suppliers/SupplierSelect';
import NumberInput from '@/app/_components/ui/NumberInput';
import { todayISO } from '@/app/_lib/date-helpers';
import { formatRate } from '@/app/_lib/format-helpers';
import Button from '@/app/_components/ui/Button';

const litreFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

/**
 * Restocking the lubricant shelf.
 *
 * Deliberately the twin of PurchaseForm, down to the wording: it is the same
 * job - a delivery note with litres and an amount on it - so it should not feel
 * like a different task because the tin is smaller than a tanker. As there, the
 * invoice total is what gets typed and the rate per litre is worked out from
 * it, never the other way round.
 *
 * QUANTITY IS IN LITRES, NOT CARTONS. A delivery of twelve 4 L cartons is 48 L,
 * and typing 12 would put the shelf out by a factor of four. The hint under the
 * box does the multiplication in front of whoever is typing, so the mistake is
 * visible before it is saved rather than a month later when the stock figure
 * makes no sense.
 *
 * `kind="loose"` records a DRUM instead. Same delivery note, same two figures,
 * same supplier - which is exactly why it is this component with a flag rather
 * than a second one. What changes is only the wording and the hint: a drum has
 * no brand and no cartons to count, so the pack arithmetic would be noise, and
 * the buying rate a litre is the figure worth showing back because it is what
 * the selling rate has to clear.
 */
export default function LubricantPurchaseForm({ lubricants, suppliers = [], kind = 'pack' }) {
  const isLoose = kind === 'loose';
  const formRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [notice, setNotice] = useState(null);
  const [showResult, setShowResult] = useState(false);

  const [state, formAction] = useActionState(createLubricantPurchase, null);

  // One drum is the normal case, and there is nothing to ask about it.
  const [lubricantId, setLubricantId] = useState(
    isLoose && lubricants.length === 1 ? lubricants[0].id : '',
  );
  const [quantity, setQuantity] = useState('');
  const [totalCost, setTotalCost] = useState('');

  const handled = useRef(state);
  useEffect(() => {
    if (state === handled.current) return;
    handled.current = state;

    if (state?.ok) {
      setIsOpen(false);
      setNotice({ message: state.message });
      formRef.current?.reset();
      setLubricantId(isLoose && lubricants.length === 1 ? lubricants[0].id : '');
      setQuantity('');
      setTotalCost('');
    }
  }, [state, isLoose, lubricants]);

  const selected = lubricants.find((row) => row.id === lubricantId) ?? null;
  const litresTyped = Number(quantity);
  const totalTyped = Number(totalCost);
  const hasLitres = Number.isFinite(litresTyped) && litresTyped > 0;
  const derivedRate = hasLitres ? totalTyped / litresTyped : null;
  const showRate = Number.isFinite(derivedRate) && derivedRate > 0;

  // How many cartons that many litres works out at, when it divides evenly.
  // Meaningless for a drum, which is not made of packs.
  const packSize = selected && !isLoose ? Number(selected.pack_size_litres) : null;
  const packs = packSize && hasLitres ? litresTyped / packSize : null;

  /*
   * For a drum, whether this delivery leaves the selling rate above water. The
   * one mistake that matters here is buying at a rate the shelf price no longer
   * clears, and it is invisible unless the two are put next to each other.
   */
  const sellRate = isLoose && selected ? Number(selected.sale_rate_per_litre) : null;
  const marginWarning =
    showRate && Number.isFinite(sellRate) && sellRate > 0 && derivedRate >= sellRate;

  return (
    <>
      <Button variant="secondary"
        type="button"
        onClick={() => {
          setShowResult(false);
          setIsOpen(true);
        }}
        disabled={lubricants.length === 0}
      >
        <span aria-hidden="true" className="text-base leading-none">
          +
        </span>
        {isLoose ? 'Record a loose oil purchase' : 'Record a lubricant purchase'}
      </Button>

      <Dialog
        open={isOpen}
        onClose={() => setIsOpen(false)}
        title={isLoose ? 'Record a loose oil purchase' : 'Record a lubricant purchase'}
      >
        <form
          ref={formRef}
          action={(formData) => {
            setShowResult(true);
            formAction(formData);
          }}
          className="space-y-4 p-5"
        >
          {/* With one drum there is nothing to choose. Keeps the form down to
              the three things actually written on the delivery note. */}
          {isLoose && lubricants.length === 1 ? (
            <input type="hidden" name="lubricant_id" value={lubricants[0].id} />
          ) : (
            <div>
              <label className="label" htmlFor="purchase_lubricant_id">
                {isLoose ? 'Which drum' : 'Lubricant'}
              </label>
              <select
                id="purchase_lubricant_id"
                name="lubricant_id"
                required
                value={lubricantId}
                onChange={(event) => setLubricantId(event.target.value)}
                className="input"
              >
                <option value="">{isLoose ? 'Choose a drum…' : 'Choose a lubricant…'}</option>
                {lubricants.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {selected ? (
            <p className="text-sm text-ink-600">
              {isLoose ? (
                <>
                  <span className="font-semibold">{selected.name}</span> holds{' '}
                  {litreFormat.format(selected.current_stock_litres ?? 0)} L today
                  {Number(selected.sale_rate_per_litre) > 0
                    ? ` · selling at ${formatRate(selected.sale_rate_per_litre)} a litre`
                    : ''}
                </>
              ) : (
                <>
                  Holds {litreFormat.format(selected.current_stock_litres ?? 0)} L today · sold in{' '}
                  {litreFormat.format(selected.pack_size_litres)} L packs
                </>
              )}
            </p>
          ) : null}

          <div>
            <label className="label" htmlFor="lubricant_purchase_date">
              Delivery date
            </label>
            <input
              id="lubricant_purchase_date"
              name="purchase_date"
              type="date"
              required
              defaultValue={todayISO()}
              className="input"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="lubricant_quantity">
                {isLoose ? 'Litres in the drum' : 'Litres'}
              </label>
              <NumberInput
                id="lubricant_quantity"
                name="quantity_litres"
                step="0.01"
                min="0.01"
                required
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                className="input-number"
                placeholder="0"
              />
            </div>
            <div>
              <label className="label" htmlFor="lubricant_total_cost">
                Invoice total
              </label>
              <NumberInput
                id="lubricant_total_cost"
                name="total_cost"
                step="0.01"
                min="0.01"
                required
                value={totalCost}
                onChange={(event) => setTotalCost(event.target.value)}
                className="input-number"
                placeholder="0.00"
              />
            </div>
          </div>

          {packs ? (
            <p className="callout">
              {litreFormat.format(litresTyped)} L is{' '}
              <span className="font-semibold">{litreFormat.format(packs)}</span> packs of{' '}
              {litreFormat.format(packSize)} L. Enter litres, not cartons.
            </p>
          ) : null}

          {isLoose && !packs ? (
            <p className="callout">
              How many litres the drum holds: 200 for a full barrel. This is what goes onto the
              stock, and the pours are taken off it as they are sold.
            </p>
          ) : null}

          {showRate ? (
            <div className="figure-box">
              <p className="caption">{isLoose ? 'Bought at' : 'Works out at'}</p>
              <p className="tabular mt-0.5 whitespace-nowrap text-xl font-bold text-ink-900">
                {formatRate(derivedRate)}{' '}
                <span className="text-base font-semibold text-ink-700">/ litre</span>
              </p>
            </div>
          ) : null}

          {marginWarning ? (
            <p className="callout-warn">
              <span className="font-semibold">
                This drum costs {formatRate(derivedRate)} a litre and is being sold at{' '}
                {formatRate(sellRate)}.
              </span>{' '}
              There is nothing to stop you saving it, but the selling rate is worth raising under
              “Manage lubricants”, because every pour off this drum loses money until it is.
            </p>
          ) : null}

          <SupplierSelect id={`lubricant_supplier_${kind}`} suppliers={suppliers} />

          <div>
            <label className="label" htmlFor="lubricant_invoice">
              Invoice number <span className="font-normal text-ink-600">(optional)</span>
            </label>
            <input id="lubricant_invoice" name="invoice_number" type="text" className="input" />
          </div>

          <div>
            <label className="label" htmlFor="lubricant_payment_status">
              Payment
            </label>
            <select
              id="lubricant_payment_status"
              name="payment_status"
              defaultValue="pending"
              className="input"
            >
              <option value="pending">Not paid yet</option>
              <option value="paid">Paid</option>
            </select>
          </div>

          <FormMessage state={showResult ? state : null} />

          <div className="flex gap-2 border-t border-ink-200 pt-4">
            <SubmitButton className="flex-1"  pendingLabel="Saving…">
              Save purchase
            </SubmitButton>
            <Button variant="secondary" type="button" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </Dialog>

      <Toast notice={notice} onDismiss={() => setNotice(null)} />
    </>
  );
}
