'use client';

import { useActionState, useEffect, useRef, useState } from 'react';

import { recordPayment } from '@/app/_lib/actions';
import SubmitButton from '@/app/_components/ui/SubmitButton';
import FormMessage from '@/app/_components/ui/FormMessage';
import Toast from '@/app/_components/ui/Toast';
import Dialog from '@/app/_components/ui/Dialog';
import Button from '@/app/_components/ui/Button';
import { todayISO } from '@/app/_lib/date-helpers';
import NumberInput from '@/app/_components/ui/NumberInput';

const moneyFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/**
 * Taking money off a customer's account.
 *
 * A DIALOG RATHER THAN A PANEL BESIDE THE TABLE. It sat in a 22rem column down
 * the right of the customer page, which cost the ledger a fifth of its width
 * every second of every day so that a form used once a visit could be
 * permanently on screen. The table is what this page is FOR - the owner reads
 * down it checking entries against a paper khata - and it was the thing being
 * squeezed, with amounts wrapping and the running balance pushed to the edge.
 *
 * The trade is the right way round: the form costs one tap when it is wanted
 * and nothing when it is not. It is also the app's settled answer everywhere
 * else - a purchase, a customer, a nozzle replacement all open a dialog from a
 * button, and this page was the last one still holding a form open beside its
 * own data.
 */
export default function PaymentForm({ customerId, balance }) {
  const formRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [notice, setNotice] = useState(null);
  const [showResult, setShowResult] = useState(false);

  const [state, formAction] = useActionState(recordPayment, null);

  const handled = useRef(state);
  useEffect(() => {
    if (state === handled.current) return;
    handled.current = state;
    if (state?.ok) {
      formRef.current?.reset();
      setIsOpen(false);
      setNotice({ message: state.message });
    }
  }, [state]);

  const today = todayISO();
  const owes = Number(balance) > 0 ? Number(balance) : 0;

  function open() {
    setShowResult(false);
    setIsOpen(true);
  }

  return (
    <>
      {/* THE ONE PRIMARY ON THIS PAGE. Recording a payment is why somebody
          opens a customer with the customer standing in front of them; the
          other three header buttons are navigation and housekeeping. It was
          left at the default outlined style when it moved out of the side
          column, which put four identical grey buttons in a row and made the
          one thing the page is for indistinguishable from "Back to
          customers". */}
      <Button variant="primary" type="button" onClick={open}>
        Record a payment
      </Button>

      <Dialog
        open={isOpen}
        onClose={() => setIsOpen(false)}
        title="Record a payment"
        subtitle={
          owes > 0 ? (
            <span className="text-sm text-ink-600">
              Settling in full would be{' '}
              <span className="tabular font-semibold text-ink-800">
                Rs {moneyFormat.format(owes)}
              </span>
            </span>
          ) : (
            <span className="text-sm text-ink-600">This account is settled</span>
          )
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

          <div>
            <label className="label" htmlFor="amount">
              Amount received
            </label>
            <NumberInput
              id="amount"
              name="amount"
              step="0.01"
              min="0.01"
              required
              className="input-number"
              placeholder="0"
            />
          </div>

          <div>
            <label className="label" htmlFor="entry_date">
              Date
            </label>
            <input
              id="entry_date"
              name="entry_date"
              type="date"
              required
              defaultValue={today}
              className="input"
            />
          </div>

          <div>
            <label className="label" htmlFor="note">
              Note <span className="font-normal text-ink-600">(optional)</span>
            </label>
            <input
              id="note"
              name="note"
              type="text"
              className="input"
              placeholder="e.g. cash, received by Imran"
            />
          </div>

          <FormMessage state={showResult ? state : null} />

          <div className="flex gap-2 border-t border-ink-200 pt-4">
            <SubmitButton className="flex-1" pendingLabel="Recording…">
              Record payment
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
