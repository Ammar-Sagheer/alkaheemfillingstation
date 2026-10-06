'use client';

import { useActionState, useEffect, useRef, useState } from 'react';

import { recordLedgerAdjustment } from '@/app/_lib/actions';
import SubmitButton from '@/app/_components/ui/SubmitButton';
import FormMessage from '@/app/_components/ui/FormMessage';
import BalanceDirection from '@/app/_components/admin/BalanceDirection';
import { todayISO } from '@/app/_lib/date-helpers';
import NumberInput from '@/app/_components/ui/NumberInput';
import Button from '@/app/_components/ui/Button';
import Dialog from '@/app/_components/ui/Dialog';
import Toast from '@/app/_components/ui/Toast';

const moneyFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const showMoney = (n) => `Rs ${moneyFormat.format(Math.round(n) === 0 ? 0 : n)}`;

/**
 * Owner-only manual ledger entry.
 *
 * Two honest uses: carrying an old balance over from the paper register, and
 * cancelling out an earlier mistake. Kept behind a toggle so it is a deliberate
 * act rather than something anyone stumbles into.
 *
 * WHY THE WORDING CHANGED. The choice used to be "Increases what they owe" and
 * "Reduces what they owe" in a dropdown, and the owner could not tell them
 * apart - two long phrases differing by one word in the middle. Picking the
 * wrong one here does not fail, it silently moves a real balance the wrong
 * way, so this is the one control on the page where being merely accurate is
 * not enough.
 *
 * A DIALOG SINCE THE RIGHT-HAND COLUMN WENT (see PaymentForm's note). It was
 * already behind a toggle, which is the same idea one step short: a panel that
 * expands in place still reserves its width beside the ledger, and the expanded
 * form pushed the page taller than the table it belonged to. A dialog is the
 * app's settled answer for a form used a few times a year, and it keeps the
 * deliberateness the toggle was there for.
 *
 * So: two cards saying what actually happened in the yard, each with an
 * example of when to use it - AND, underneath, the balance this would produce.
 * The figure is what makes the choice checkable. Somebody who misreads both
 * labels will still notice that Rs 3,000 is about to become Rs 8,000 when they
 * meant to clear the account.
 */
export default function LedgerAdjustmentForm({ customerId, balance = 0 }) {
  const formRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [direction, setDirection] = useState('');
  const [amount, setAmount] = useState('');

  const [notice, setNotice] = useState(null);
  const [showResult, setShowResult] = useState(false);

  const [state, formAction] = useActionState(recordLedgerAdjustment, null);

  const handled = useRef(state);
  useEffect(() => {
    if (state === handled.current) return;
    handled.current = state;
    if (state?.ok) {
      formRef.current?.reset();
      setDirection('');
      setAmount('');
      setIsOpen(false);
      setNotice({ message: state.message });
    }
  }, [state]);

  const today = todayISO();

  function open() {
    // Reopening starts blank rather than showing what was half-typed and
    // abandoned last time - this control moves a real balance.
    setShowResult(false);
    setDirection('');
    setAmount('');
    setIsOpen(true);
  }

  const current = Number(balance ?? 0);
  const typed = Number(amount);
  const hasAmount = Number.isFinite(typed) && typed > 0;
  // Whole rupees, matching the ledger itself - see roundRupees in helpers.js.
  const change = hasAmount ? Math.round(typed) : 0;
  const after =
    direction === 'owes' ? current + change : direction === 'in_credit' ? current - change : null;

  const showPreview = direction !== '' && hasAmount;

  return (
    <>
      <Button variant="secondary" type="button" onClick={open}>
        Make a manual adjustment
      </Button>

      <Dialog
        open={isOpen}
        onClose={() => setIsOpen(false)}
        title="Manual adjustment"
        subtitle={
          <span className="text-sm text-ink-600">
            For a balance carried over from the old register, or an amount written off
          </span>
        }
      >
        <form
          ref={formRef}
          action={(formData) => {
            setShowResult(true);
            formAction(formData);
          }}
          className="space-y-4 p-5"
        >
          <input type="hidden" name="customer_id" value={customerId} />
          {/* The action still speaks debit/credit; the translation happens here so
              the two words never reach the screen. */}
          <input
            type="hidden"
            name="entry_type"
            value={direction === 'owes' ? 'debit' : direction === 'in_credit' ? 'credit' : ''}
          />

          <fieldset>
            <legend className="label">Which way does this go?</legend>
            <BalanceDirection
              name="direction"
              value={direction}
              onChange={setDirection}
              options={[
                {
                  value: 'owes',
                  title: 'They owe more',
                  // Same two register words as the New customer form, so the owner
                  // is choosing between the terms he already writes by hand.
                  urdu: 'بنام',
                  detail: 'Fuel from the old register, or something that was missed',
                },
                {
                  value: 'in_credit',
                  title: 'They owe less',
                  urdu: 'جمع',
                  detail: 'Money already paid that is not on this list, or an amount written off',
                },
              ]}
            />
          </fieldset>

          <div>
            <label className="label" htmlFor="adjustment_amount">
              Amount
            </label>
            <NumberInput
              id="adjustment_amount"
              name="amount"
              step="1"
              min="1"
              required
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="input-number"
              placeholder="0"
            />
          </div>

          {/* The check that matters. Stated as the sentence the owner would say. */}
          {showPreview ? (
            <p className="callout">
              {showMoney(current)} <span aria-hidden="true">→</span>{' '}
              <span className="whitespace-nowrap font-bold text-ink-900">{showMoney(after)}</span>
              <span className="mt-0.5 block text-ink-600">
                {after > 0
                  ? `${showMoney(after)} owed to the pump after this.`
                  : after < 0
                    ? `The pump would owe them ${showMoney(Math.abs(after))} after this.`
                    : 'The account would be settled after this.'}
              </span>
            </p>
          ) : null}

          <div>
            <label className="label" htmlFor="adjustment_date">
              Date
            </label>
            <input
              id="adjustment_date"
              name="entry_date"
              type="date"
              required
              defaultValue={today}
              className="input"
            />
          </div>

          <div>
            <label className="label" htmlFor="adjustment_note">
              Reason
            </label>
            <input
              id="adjustment_note"
              name="note"
              type="text"
              required
              className="input"
              placeholder="e.g. opening balance from the old register"
            />
            <p className="mt-1 text-sm text-ink-600">
              Required, and it stays on the record. If it turns out wrong it is corrected with
              a cancelling entry, never rubbed out.
            </p>
          </div>

          <FormMessage state={showResult ? state : null} />

          <div className="flex gap-2 border-t border-ink-200 pt-4">
            <SubmitButton className="flex-1" pendingLabel="Posting…" disabled={!direction}>
              Post adjustment
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
