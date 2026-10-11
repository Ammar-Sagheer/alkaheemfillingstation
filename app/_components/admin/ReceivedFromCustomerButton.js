'use client';

import { useActionState, useEffect, useRef, useState } from 'react';

import { recordPayment } from '@/app/_lib/actions';
import SubmitButton from '@/app/_components/ui/SubmitButton';
import FormMessage from '@/app/_components/ui/FormMessage';
import Toast from '@/app/_components/ui/Toast';
import Dialog from '@/app/_components/ui/Dialog';
import Button from '@/app/_components/ui/Button';
import NumberInput from '@/app/_components/ui/NumberInput';
import { VehicleFinder, customerLabel } from '@/app/_components/admin/VehiclePicker';

/**
 * Money a customer paid, entered from the nozzle's own form, beside the credit
 * slips (asked for by Al Tufail, October 2026; built here for Al Hakeem at the owner's request). A credit customer who settles at the pump is
 * paying the other way from a slip: the staff take the cash, so it belongs with
 * the day's entries, not on a customer page opened later.
 *
 * IT IS THE SAME ENTRY AS "Record a payment" ON THE CUSTOMER PAGE: the same
 * action (`recordPayment`), a credit on the customer's ledger, dated the day the
 * readings are for. Nothing new in the database. It saves on its own, not with
 * the reading, so it works before the meter is typed in and after the reading is
 * saved, and cancelling a reading never takes a customer's payment with it.
 *
 * Reads in English (no language layer in this copy).
 */
export default function ReceivedFromCustomerButton({ customers = [], date }) {
  const formRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [notice, setNotice] = useState(null);

  const [state, formAction] = useActionState(recordPayment, null);
  const handled = useRef(state);
  useEffect(() => {
    if (state === handled.current) return;
    handled.current = state;
    if (state?.ok) {
      formRef.current?.reset();
      setCustomerId('');
      setIsOpen(false);
      setNotice({ message: `${state.message} It is on the customer's account.` });
    }
  }, [state]);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200
                   bg-white px-3 py-1.5 text-sm font-semibold text-ink-800 transition
                   hover:border-ink-300 hover:bg-ink-50
                   focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
      >
        <span aria-hidden="true" className="text-base leading-none">
          +
        </span>
        Money received
      </button>

      <Dialog
        open={isOpen}
        onClose={() => setIsOpen(false)}
        title="Money received from a customer"
        subtitle={
          <span className="text-sm text-ink-600">
            A payment on their credit account, dated {date}
          </span>
        }
      >
        <form ref={formRef} action={formAction} className="space-y-4 p-5">
          <input type="hidden" name="customer_id" value={customerId} />
          <input type="hidden" name="entry_date" value={date} />

          <div className="space-y-2">
            <label className="label" htmlFor={`received-customer-${date}`}>
              Who paid
            </label>
            <VehicleFinder customers={customers} onPick={(picked) => setCustomerId(picked)} />
            <select
              id={`received-customer-${date}`}
              required
              value={customerId}
              onChange={(event) => setCustomerId(event.target.value)}
              className="input"
            >
              <option value="">Choose the customer</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customerLabel(customer)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor={`received-amount-${date}`}>
              Amount received
            </label>
            <NumberInput
              id={`received-amount-${date}`}
              name="amount"
              step="1"
              min="1"
              required
              className="input-number"
              placeholder="0"
            />
          </div>

          <div>
            <label className="label" htmlFor={`received-note-${date}`}>
              Note <span className="font-normal text-ink-600">(optional)</span>
            </label>
            <input
              id={`received-note-${date}`}
              name="note"
              type="text"
              autoComplete="off"
              className="input"
              placeholder="e.g. cash, received at nozzle 2"
            />
          </div>

          <FormMessage state={state?.ok === false ? state : null} />

          <div className="flex gap-2 border-t border-ink-200 pt-4">
            <SubmitButton className="flex-1" pendingLabel="Saving…">
              Record the payment
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
