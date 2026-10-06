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
import { formatRate, saleAmount as exactSaleAmount } from '@/app/_lib/format-helpers';
import Button from '@/app/_components/ui/Button';

/*
 * Formatted inline rather than through helpers.js, which reaches into request
 * cookies and so cannot be bundled for the browser - the same arrangement
 * ReadingForm uses.
 */
const litreFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const moneyFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

const showLitres = (n) => `${litreFormat.format(n || 0)} L`;
const showMoney = (n) => `Rs ${moneyFormat.format(n || 0)}`;
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * The loose-oil amounts worth a single tap. A quarter and a half litre are what
 * actually gets poured from an open drum for a motorcycle or a top-up; a whole
 * litre is common enough to belong beside them. The product's own pack size is
 * offered first and separately - see the buttons below.
 */
const LOOSE_AMOUNTS = [0.25, 0.5, 1];

/**
 * Recording one counter sale.
 *
 * A dialog rather than a form standing open on the page, for the same reason as
 * the delivery form: this is filled in a few times a day, while the table
 * behind it is read continuously.
 *
 * TWO THINGS THIS FORM IS CAREFUL ABOUT.
 *
 * The litres box takes any number, and the pack buttons above it are only
 * shortcuts into that box. A pump that sells a sealed 4 L carton and 250 ml of
 * loose oil out of the same drum is selling the same stock either way, so both
 * have to be typeable without switching to a different kind of entry.
 *
 * The amount box is prefilled from the product's rate but stays editable, and
 * once it has been touched it is left alone. A carton is usually priced below
 * the sum of its litres, and a rate that quietly overwrote what someone typed
 * would be worse than no prefill at all.
 */
export default function LubricantSaleForm({ lubricants, customers, date, dateLabel }) {
  const formRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [notice, setNotice] = useState(null);
  const [showResult, setShowResult] = useState(false);

  const [state, formAction] = useActionState(createLubricantSale, null);

  const [lubricantId, setLubricantId] = useState('');
  const [litres, setLitres] = useState('');
  const [amount, setAmount] = useState('');
  const [amountTouched, setAmountTouched] = useState(false);
  const [payment, setPayment] = useState('cash');
  const [creditAmount, setCreditAmount] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [vehicleId, setVehicleId] = useState('');

  const selected = lubricants.find((row) => row.id === lubricantId) ?? null;
  const litresTyped = Number(litres);
  const amountTyped = Number(amount);
  const hasLitres = Number.isFinite(litresTyped) && litresTyped > 0;
  const hasAmount = Number.isFinite(amountTyped) && amountTyped > 0;

  function reset() {
    formRef.current?.reset();
    setLubricantId('');
    setLitres('');
    setAmount('');
    setAmountTouched(false);
    setPayment('cash');
    setCreditAmount('');
    setCustomerId('');
      setVehicleId('');
  }

  // Close once it has gone through, carrying the confirmation out with it: the
  // new row is already on the table behind, so the dialog would only be there
  // to be dismissed.
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

  // Prefill the amount from the product's rate, until someone types over it.
  useEffect(() => {
    if (amountTouched) return;
    const rate = Number(selected?.sale_rate_per_litre);
    if (!selected || !Number.isFinite(rate) || rate <= 0 || !hasLitres) return;
    // Exact, for the same reason readings are - see format-helpers.js. This
    // one was never refused (the constraint compares the split against this
    // very figure, so both sides shared the error), but it could store an
    // amount a paisa away from what litres x rate actually comes to.
    setAmount(String(exactSaleAmount(litresTyped, rate)));
  }, [selected, litresTyped, hasLitres, amountTouched]);

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

  // What is on the shelf, and whether this sale would take it past empty.
  const stockLeft = selected ? Number(selected.stock_litres ?? 0) : null;
  const wouldOversell = selected && hasLitres && stockLeft !== null && litresTyped > stockLeft;

  const derivedRate = hasLitres && hasAmount ? amountTyped / litresTyped : null;

  return (
    <>
      <Button variant="primary"
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
        Record a lubricant sale
      </Button>

      <Dialog
        open={isOpen}
        onClose={() => setIsOpen(false)}
        title="Record a lubricant sale"
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
          {/* The credit figure is derived from the choice above it rather than
              read straight off a box, so "all on credit" cannot disagree with
              the amount it is all of. */}
          <input type="hidden" name="credit_amount" value={credit} />

          <div>
            <label className="label" htmlFor="lubricant_id">
              Lubricant
            </label>
            <select
              id="lubricant_id"
              name="lubricant_id"
              required
              value={lubricantId}
              onChange={(event) => {
                setLubricantId(event.target.value);
                setAmountTouched(false);
              }}
              className="input"
            >
              <option value="">Choose a lubricant…</option>
              {lubricants.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
            {selected ? (
              <p className="mt-1 text-sm text-ink-600">
                <span className={stockLeft <= 0 ? 'font-semibold text-red-700' : 'font-semibold'}>
                  {showLitres(stockLeft)}
                </span>{' '}
                on the shelf · sold in {litreFormat.format(selected.pack_size_litres)} L packs
                {Number(selected.sale_rate_per_litre) > 0
                  ? ` · ${formatRate(selected.sale_rate_per_litre)} a litre`
                  : ''}
              </p>
            ) : null}
          </div>

          <div>
            <label className="label" htmlFor="litres">
              How much was sold
            </label>

            {/* Shortcuts into the box below, not a separate kind of sale. A
                sealed pack and a loose pour are the same stock in litres. */}
            <div className="mb-2 flex flex-wrap gap-2">
              {selected ? (
                <QuickLitres
                  value={Number(selected.pack_size_litres)}
                  label={`${litreFormat.format(selected.pack_size_litres)} L pack`}
                  active={litresTyped === Number(selected.pack_size_litres)}
                  onPick={(value) => {
                    setLitres(String(value));
                    setAmountTouched(false);
                  }}
                />
              ) : null}
              {LOOSE_AMOUNTS.filter(
                (value) => !selected || value !== Number(selected.pack_size_litres),
              ).map((value) => (
                <QuickLitres
                  key={value}
                  value={value}
                  label={`${value} L`}
                  active={litresTyped === value}
                  onPick={(picked) => {
                    setLitres(String(picked));
                    setAmountTouched(false);
                  }}
                />
              ))}
            </div>

            <NumberInput
              id="litres"
              name="litres"
              step="0.01"
              min="0.01"
              required
              value={litres}
              onChange={(event) => {
                setLitres(event.target.value);
                setAmountTouched(false);
              }}
              className="input-number"
              placeholder="0"
            />
            <p className="mt-1 text-sm text-ink-600">
              In litres. Loose oil is fine: 0.25 for a quarter litre.
            </p>
          </div>

          {wouldOversell ? (
            <p className="callout-warn">
              <span className="font-semibold">
                Only {showLitres(stockLeft)} of {selected.name} is on the shelf.
              </span>{' '}
              Either a delivery has not been recorded yet, or the quantity is mistyped. You can
              still save this if it is genuinely right.
            </p>
          ) : null}

          <div>
            <label className="label" htmlFor="amount">
              Amount charged
            </label>
            <NumberInput
              id="amount"
              name="amount"
              step="0.01"
              min="0.01"
              required
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
                setAmountTouched(true);
              }}
              className="input-number"
              placeholder="0"
            />
            {derivedRate ? (
              <p className="mt-1 text-sm text-ink-600">
                Works out at {formatRate(derivedRate)} a litre.
              </p>
            ) : null}
          </div>

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
              <label className="label" htmlFor="credit_typed">
                How much of it is on credit
              </label>
              <NumberInput
                id="credit_typed"
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
              <label className="label" htmlFor="customer_id">
                Customer
              </label>
              <select
                id="customer_id"
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
                    id="customer_id_vehicle"
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
            <label className="label" htmlFor="sale_note">
              Note <span className="font-normal text-ink-600">(optional)</span>
            </label>
            <input id="sale_note" name="note" type="text" className="input" />
          </div>

          <FormMessage state={showResult ? state : null} />

          <div className="flex gap-2 border-t border-ink-200 pt-4">
            <SubmitButton className="flex-1"  pendingLabel="Saving…" disabled={creditTooBig}>
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

function QuickLitres({ value, label, active, onPick }) {
  return (
    <button
      type="button"
      onClick={() => onPick(value)}
      aria-pressed={active}
      className={[
        'rounded-xl border px-3 py-1.5 text-sm font-semibold transition',
        active
          ? 'border-brand-600 bg-brand-50 text-brand-800'
          : 'border-ink-300 bg-white text-ink-700 hover:bg-ink-50',
      ].join(' ')}
    >
      {label}
    </button>
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
