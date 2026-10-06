'use client';

import { useActionState, useEffect, useRef, useState } from 'react';

import {
  VehicleSelect,
  customerLabel,
  defaultVehicleFor,
} from '@/app/_components/admin/VehiclePicker';
import { createLubricantSale } from '@/app/_lib/actions';
import SubmitButton from '@/app/_components/ui/SubmitButton';
import FormMessage from '@/app/_components/ui/FormMessage';
import Toast from '@/app/_components/ui/Toast';
import Dialog from '@/app/_components/ui/Dialog';
import NumberInput from '@/app/_components/ui/NumberInput';
import { formatRate, formatLitresFine } from '@/app/_lib/format-helpers';
import Button from '@/app/_components/ui/Button';

/*
 * Formatted inline rather than through helpers.js, which reaches into request
 * cookies and so cannot be bundled for the browser - the same arrangement
 * ReadingForm and LubricantSaleForm use.
 */
const moneyFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const showMoney = (n) => `Rs ${moneyFormat.format(n || 0)}`;
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const round3 = (n) => Math.round((n + Number.EPSILON) * 1000) / 1000;

/**
 * The rupee amounts worth a single tap. These are the sales the owner described
 * - someone topping up a motorcycle asks for "Rs 20 of oil", not for a
 * quantity. Rs 100 is on the end because it is the round number people reach
 * for once the small ones are not enough.
 */
const QUICK_AMOUNTS = [20, 30, 50, 100];

/**
 * Recording one pour from the drum.
 *
 * WHY THIS IS NOT THE SAME FORM AS A CARTON. The difference is not cosmetic:
 * these two sales are typed from opposite ends. A carton is a quantity that has
 * a price - four litres, Rs 4,500. A pour is a price that has a quantity - Rs
 * 20, and however much oil that turns out to be. Asking for litres here would
 * mean the owner dividing 20 by 580 in his head at the counter, several times a
 * day, and the arithmetic is the app's job.
 *
 * So the only number typed is the money. The litres are shown underneath as a
 * consequence, not as a field - and the server recomputes them from the drum's
 * rate rather than trusting what the browser sends, so the figure on screen is
 * a preview of the arithmetic rather than an input to it.
 */
export default function LooseOilSaleForm({ drums, customers, date, dateLabel }) {
  const formRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [notice, setNotice] = useState(null);
  const [showResult, setShowResult] = useState(false);

  const [state, formAction] = useActionState(createLubricantSale, null);

  // With one drum there is nothing to choose, so it is chosen already. Most
  // pumps keep one; the select appears only when there is a second.
  const [lubricantId, setLubricantId] = useState(drums.length === 1 ? drums[0].id : '');
  const [amount, setAmount] = useState('');
  const [payment, setPayment] = useState('cash');
  const [creditAmount, setCreditAmount] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [vehicleId, setVehicleId] = useState('');

  const selected = drums.find((row) => row.id === lubricantId) ?? null;
  const amountTyped = Number(amount);
  const hasAmount = Number.isFinite(amountTyped) && amountTyped > 0;

  function reset() {
    formRef.current?.reset();
    setLubricantId(drums.length === 1 ? drums[0].id : '');
    setAmount('');
    setPayment('cash');
    setCreditAmount('');
    setCustomerId('');
      setVehicleId('');
  }

  const handled = useRef(state);
  useEffect(() => {
    if (state === handled.current) return;
    handled.current = state;

    if (state?.ok) {
      setIsOpen(false);
      setNotice({ message: state.message });
      reset();
    }
  }, [state]);

  const rate = Number(selected?.sale_rate_per_litre);
  const hasRate = Number.isFinite(rate) && rate > 0;
  // The same arithmetic the server will do, to three decimals for the same
  // reason - see roundLitres in actions.js.
  const litres = hasAmount && hasRate ? round3(amountTyped / rate) : null;

  const credit =
    payment === 'credit'
      ? hasAmount
        ? round2(amountTyped)
        : 0
      : payment === 'split'
        ? Math.max(0, round2(Number(creditAmount) || 0))
        : 0;

  const cash = hasAmount ? round2(amountTyped - credit) : 0;
  const creditTooBig = hasAmount && credit > amountTyped;

  const stockLeft = selected ? Number(selected.stock_litres ?? 0) : null;
  const wouldOversell = selected && litres !== null && stockLeft !== null && litres > stockLeft;

  return (
    <>
      <Button variant="primary"
        type="button"
        onClick={() => {
          setShowResult(false);
          setIsOpen(true);
        }}
        disabled={drums.length === 0}
      >
        <span aria-hidden="true" className="text-base leading-none">
          +
        </span>
        Record a loose oil sale
      </Button>

      <Dialog
        open={isOpen}
        onClose={() => setIsOpen(false)}
        title="Record a loose oil sale"
        subtitle={<span className="text-sm text-ink-600">{dateLabel}</span>}
      >
        <form
          ref={formRef}
          action={(formData) => {
            setShowResult(true);
            formAction(formData);
          }}
          className="space-y-4 p-5"
        >
          <input type="hidden" name="sale_date" value={date} />
          <input type="hidden" name="credit_amount" value={credit} />

          {/* One drum needs no question asked about it. */}
          {drums.length === 1 ? (
            <input type="hidden" name="lubricant_id" value={drums[0].id} />
          ) : (
            <div>
              <label className="label" htmlFor="loose_lubricant_id">
                Which drum
              </label>
              <select
                id="loose_lubricant_id"
                name="lubricant_id"
                required
                value={lubricantId}
                onChange={(event) => setLubricantId(event.target.value)}
                className="input"
              >
                <option value="">Choose a drum…</option>
                {drums.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="label" htmlFor="loose_amount">
              How much was it sold for
            </label>

            <div className="mb-2 flex flex-wrap gap-2">
              {QUICK_AMOUNTS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setAmount(String(value))}
                  aria-pressed={amountTyped === value}
                  className={[
                    'rounded-xl border px-3 py-1.5 text-sm font-semibold transition',
                    amountTyped === value
                      ? 'border-brand-600 bg-brand-50 text-brand-800'
                      : 'border-ink-300 bg-white text-ink-700 hover:bg-ink-50',
                  ].join(' ')}
                >
                  Rs {value}
                </button>
              ))}
            </div>

            <NumberInput
              id="loose_amount"
              name="amount"
              step="1"
              min="1"
              required
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="input-number"
              placeholder="0"
            />
            <p className="mt-1 text-sm text-ink-600">
              In rupees. The litres are worked out from the drum’s rate.
            </p>
          </div>

          {/* The consequence of the amount above, stated rather than asked for.
              Shown even before an amount is typed, so the rate being used is
              visible while deciding - a wrong rate is the one thing that can
              make every loose sale wrong at once. */}
          {selected ? (
            <div className={hasRate ? 'callout' : 'callout-danger'}>
              {hasRate ? (
                <>
                  <p className="text-sm text-ink-700">
                    At <span className="font-semibold">{formatRate(rate)}</span> a litre
                    {litres !== null ? (
                      <>
                        , {showMoney(amountTyped)} is{' '}
                        <span className="font-bold text-ink-900 whitespace-nowrap">
                          {formatLitresFine(litres)}
                        </span>{' '}
                        off the drum.
                      </>
                    ) : (
                      '.'
                    )}
                  </p>
                  <p className="mt-0.5 text-sm text-ink-600">
                    {formatLitresFine(stockLeft)} left in {selected.name}.
                  </p>
                </>
              ) : (
                <p>
                  <span className="font-semibold">{selected.name} has no selling rate.</span> Set a
                  rate per litre under “Manage lubricants”. Without one there is no way to tell how
                  much oil a rupee figure is.
                </p>
              )}
            </div>
          ) : null}

          {wouldOversell ? (
            <p className="callout-warn">
              <span className="font-semibold">
                Only {formatLitresFine(stockLeft)} is left in {selected.name}.
              </span>{' '}
              Either the last drum has not been recorded on Purchases yet, or the amount is
              mistyped. You can still save this if it is genuinely right.
            </p>
          ) : null}

          <fieldset>
            <legend className="label">How was it paid for?</legend>
            <div className="grid grid-cols-3 gap-2">
              <PaymentChoice
                value="cash"
                label="Cash"
                active={payment === 'cash'}
                onPick={setPayment}
              />
              <PaymentChoice
                value="credit"
                label="All credit"
                active={payment === 'credit'}
                onPick={setPayment}
              />
              <PaymentChoice
                value="split"
                label="Part credit"
                active={payment === 'split'}
                onPick={setPayment}
              />
            </div>
          </fieldset>

          {payment === 'split' ? (
            <div>
              <label className="label" htmlFor="loose_credit_typed">
                How much of it is on credit
              </label>
              <NumberInput
                id="loose_credit_typed"
                step="0.01"
                min="0"
                value={creditAmount}
                onChange={(event) => setCreditAmount(event.target.value)}
                className="input-number"
                placeholder="0"
              />
            </div>
          ) : null}

          {payment !== 'cash' ? (
            <div>
              <label className="label" htmlFor="loose_customer_id">
                Customer
              </label>
              <select
                id="loose_customer_id"
                name="customer_id"
                required
                value={customerId}
                onChange={(event) => {
                  setCustomerId(event.target.value);
                  setVehicleId(defaultVehicleFor(customers.find((c) => c.id === event.target.value)));
                }}
                className="input"
              >
                <option value="">Choose a customer…</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customerLabel(customer)}
                  </option>
                ))}
              </select>
              {customerId ? (
                <div className="mt-2">
                  <VehicleSelect
                    id="loose_customer_id_vehicle"
                    name="vehicle_id"
                    customer={customers.find((c) => c.id === customerId)}
                    value={vehicleId}
                    onChange={setVehicleId}
                  />
                </div>
              ) : null}
              <p className="mt-1 text-sm text-ink-600">
                The credit is posted to their ledger as soon as this is saved.
              </p>
            </div>
          ) : null}

          {creditTooBig ? (
            <p className="callout-danger">
              The credit is more than the sale itself. Lower it to {showMoney(amountTyped)} or less.
            </p>
          ) : null}

          {hasAmount ? (
            <div className="figure-box">
              <div className="flex items-baseline justify-between gap-4">
                <span className="caption">Cash in hand</span>
                <span className="tabular whitespace-nowrap text-xl font-bold text-ink-900">
                  {showMoney(Math.max(0, cash))}
                </span>
              </div>
              {credit > 0 ? (
                <div className="mt-1.5 flex items-baseline justify-between gap-4 border-t border-ink-200 pt-1.5">
                  <span className="caption">On credit</span>
                  <span className="tabular whitespace-nowrap text-base font-semibold text-ink-900">
                    {showMoney(credit)}
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}

          <div>
            <label className="label" htmlFor="loose_note">
              Note <span className="font-normal text-ink-600">(optional)</span>
            </label>
            <input id="loose_note" name="note" type="text" className="input" />
          </div>

          <FormMessage state={showResult ? state : null} />

          <div className="flex gap-2 border-t border-ink-200 pt-4">
            <SubmitButton
              className="flex-1" 
              pendingLabel="Saving…"
              disabled={creditTooBig || (Boolean(selected) && !hasRate)}
            >
              Save sale
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

function PaymentChoice({ value, label, active, onPick }) {
  return (
    <button
      type="button"
      onClick={() => onPick(value)}
      aria-pressed={active}
      className={[
        'rounded-xl border px-3 py-2 text-sm font-semibold transition',
        active
          ? 'border-brand-600 bg-brand-50 text-brand-800'
          : 'border-ink-300 bg-white text-ink-700 hover:bg-ink-50',
      ].join(' ')}
    >
      {label}
    </button>
  );
}
