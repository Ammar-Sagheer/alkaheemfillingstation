'use client';

import { useActionState, useEffect, useRef, useState } from 'react';

import { createPurchase } from '@/app/_lib/actions';
import SubmitButton from '@/app/_components/ui/SubmitButton';
import FormMessage from '@/app/_components/ui/FormMessage';
import Toast from '@/app/_components/ui/Toast';
import Dialog from '@/app/_components/ui/Dialog';
import { todayISO } from '@/app/_lib/date-helpers';
import SupplierSelect from '@/app/_components/admin/suppliers/SupplierSelect';
import NumberInput from '@/app/_components/ui/NumberInput';
import { formatRate } from '@/app/_lib/format-helpers';
import Button from '@/app/_components/ui/Button';

const litreFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

/**
 * Recording a delivery, behind a dialog.
 *
 * It used to sit open on the page beside the table, but this form has seven
 * fields and the table beside it has seven columns of its own - giving both
 * the room they need meant a fixed-width column next to the table that was
 * mostly empty whitespace once the table's own columns were laid out. A
 * delivery is also logged once a day at most, not something read continuously
 * the way the table is, so it does not need to stand open on the page either.
 */
export default function PurchaseForm({ tanks, suppliers = [] }) {
  const formRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [notice, setNotice] = useState(null);
  const [showResult, setShowResult] = useState(false);

  const [state, formAction] = useActionState(createPurchase, null);

  const [quantity, setQuantity] = useState('');
  const [totalCost, setTotalCost] = useState('');
  const [tankId, setTankId] = useState('');

  // Close once it has gone through, and carry the confirmation out with it -
  // same reasoning as BankAccountForm: the new row is already on the table
  // behind, so the dialog would only be there to be dismissed.
  const handled = useRef(state);
  useEffect(() => {
    if (state === handled.current) return;
    handled.current = state;

    if (state?.ok) {
      setIsOpen(false);
      setNotice({ message: state.message });
      formRef.current?.reset();
      setQuantity('');
      setTotalCost('');
      setTankId('');
    }
  }, [state]);

  // The rate is worked out from what was typed, not typed in - it is a
  // generated column in the database for the same reason (migration 023). The
  // delivery note states litres and an amount; the rate is arithmetic on those.
  const litresTyped = Number(quantity);
  const totalTyped = Number(totalCost);
  const derivedRate = litresTyped > 0 ? totalTyped / litresTyped : null;
  const showRate = Number.isFinite(derivedRate) && derivedRate > 0;

  const today = todayISO();

  /*
   * Warn when a delivery would not physically fit. A tank that already holds
   * 22,000 of a 25,000 litre capacity cannot take 10,000 more - so either the
   * quantity is mistyped or the book stock is already wrong. Catching it here,
   * before saving, is far easier than unpicking it later.
   */
  const selectedTank = tanks.find((tank) => tank.id === tankId);
  const spaceLeft = selectedTank
    ? Number(selectedTank.capacity_litres) - Number(selectedTank.current_stock_litres)
    : null;
  const litres = Number(quantity);
  const wouldOverfill =
    selectedTank && Number.isFinite(litres) && litres > 0 && spaceLeft !== null && litres > spaceLeft;

  return (
    <>
      <Button variant="primary"
        type="button"
        onClick={() => {
          setShowResult(false);
          setIsOpen(true);
        }}
      >
        <span aria-hidden="true" className="text-base leading-none">
          +
        </span>
        Record a delivery
      </Button>

      <Dialog open={isOpen} onClose={() => setIsOpen(false)} title="Record a delivery">
        <form
          ref={formRef}
          action={(formData) => {
            setShowResult(true);
            formAction(formData);
          }}
          className="space-y-4 p-5"
        >
          <div>
            <label className="label" htmlFor="tank_id">
              Tank
            </label>
            <select
              id="tank_id"
              name="tank_id"
              required
              value={tankId}
              onChange={(event) => setTankId(event.target.value)}
              className="input"
            >
              <option value="">Choose a tank…</option>
              {tanks.map((tank) => (
                <option key={tank.id} value={tank.id}>
                  {tank.name}
                </option>
              ))}
            </select>
            {selectedTank ? (
              <p className="mt-1.5 text-sm text-ink-700">
                Holds{' '}
                <span className="whitespace-nowrap">
                  {litreFormat.format(selectedTank.current_stock_litres)} L
                </span>{' '}
                of{' '}
                <span className="whitespace-nowrap">
                  {litreFormat.format(selectedTank.capacity_litres)} L
                </span>
                , with{' '}
                <span
                  className={`whitespace-nowrap font-semibold ${spaceLeft < 0 ? 'text-red-700' : 'text-ink-900'}`}
                >
                  {litreFormat.format(Math.max(0, spaceLeft))} L
                </span>{' '}
                of space left.
              </p>
            ) : null}
          </div>

          <div>
            <label className="label" htmlFor="purchase_date">
              Delivery date
            </label>
            <input
              id="purchase_date"
              name="purchase_date"
              type="date"
              required
              defaultValue={today}
              className="input"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="quantity_litres">
                Litres
              </label>
              <NumberInput
                id="quantity_litres"
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
              <label className="label" htmlFor="total_cost">
                Invoice total
              </label>
              <NumberInput
                id="total_cost"
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

          {wouldOverfill ? (
            <p className="callout-warn">
              <span className="font-semibold">
                {litreFormat.format(litres)} L will not fit in {selectedTank.name}.
              </span>{' '}
              It has only {litreFormat.format(Math.max(0, spaceLeft))} L of space. Either the
              quantity is mistyped, or an earlier reading or delivery is wrong. You can still save
              this if the figure is genuinely right.
            </p>
          ) : null}

          {showRate ? (
            <div className="figure-box">
              <p className="caption">Works out at</p>
              <p className="tabular mt-0.5 whitespace-nowrap text-xl font-bold text-ink-900">
                {formatRate(derivedRate)}{' '}
                <span className="text-base font-semibold text-ink-700">/ litre</span>
              </p>
            </div>
          ) : null}

          <SupplierSelect id="supplier_id" suppliers={suppliers} label="Supplier / OMC" />

          <div>
            <label className="label" htmlFor="invoice_number">
              Invoice number <span className="font-normal text-ink-600">(optional)</span>
            </label>
            <input id="invoice_number" name="invoice_number" type="text" className="input" />
          </div>

          <div>
            <label className="label" htmlFor="payment_status">
              Payment
            </label>
            <select
              id="payment_status"
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
              Save delivery
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
