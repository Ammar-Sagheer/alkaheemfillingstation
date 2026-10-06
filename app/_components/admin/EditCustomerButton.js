'use client';

import { useActionState, useEffect, useRef, useState } from 'react';

import { updateCustomer } from '@/app/_lib/actions';
import SubmitButton from '@/app/_components/ui/SubmitButton';
import FormMessage from '@/app/_components/ui/FormMessage';
import Toast from '@/app/_components/ui/Toast';
import Dialog from '@/app/_components/ui/Dialog';
import NumberInput from '@/app/_components/ui/NumberInput';
import Button from '@/app/_components/ui/Button';
import IconButton from '@/app/_components/ui/IconButton';

/**
 * Correcting a customer's details from their own page.
 *
 * Names get typed wrong, people change their phone, a lorry gets replaced, a
 * credit limit gets raised. None of that was editable, so the only way to fix
 * a misspelled name was to add a second customer and split the history across
 * the two - the worst possible outcome for a ledger.
 *
 * DETAILS ONLY, AND THAT IS THE POINT. The balance is not here and cannot be:
 * it lives in the ledger, which is append-only, and moves with a payment or an
 * adjustment. Someone can safely be trusted to fix a spelling without being
 * trusted to change what a man owes.
 *
 * The same fields as the New customer dialog, in the same order, minus the
 * opening balance - which belongs only at the moment the account is created,
 * because afterwards the honest way to move a balance is an entry that says
 * why.
 *
 * TWO TRIGGERS, ONE FORM. The customer's own page has room for a labelled
 * "Edit details" button beside "Back to customers"; a row in the Customers
 * table does not, and a repeated word down every row is the same noise
 * `IconButton`'s own note describes for Remove. `iconOnly` swaps the trigger
 * for a pencil icon - the row already names whose details it opens - while
 * the dialog and the action underneath stay the one copy.
 */
export default function EditCustomerButton({ customer, iconOnly = false }) {
  const formRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [notice, setNotice] = useState(null);
  const [showResult, setShowResult] = useState(false);

  const [state, formAction] = useActionState(updateCustomer, null);

  const handled = useRef(state);
  useEffect(() => {
    if (state === handled.current) return;
    handled.current = state;
    if (state?.ok) {
      setIsOpen(false);
      setNotice({ message: state.message });
    }
  }, [state]);

  function open() {
    setShowResult(false);
    setIsOpen(true);
  }

  return (
    <>
      {iconOnly ? (
        <IconButton name="pencil" label={`Edit ${customer.name}`} onClick={open} />
      ) : (
        <Button variant="secondary" type="button" onClick={open}>
          Edit details
        </Button>
      )}

      <Dialog
        open={isOpen}
        onClose={() => setIsOpen(false)}
        title="Edit details"
        subtitle={
          <span className="text-sm text-ink-600">
            What they owe is not changed here. Use a payment or an adjustment for that.
          </span>
        }
      >
        <form
          ref={formRef}
          action={(formData) => {
            setShowResult(true);
            formAction(formData);
          }}
          className="space-y-3 p-5"
        >
          <input type="hidden" name="customer_id" value={customer.id} />

          <div>
            <label className="label" htmlFor="edit_name">
              Name
            </label>
            <input
              id="edit_name"
              name="name"
              type="text"
              required
              defaultValue={customer.name ?? ''}
              className="input"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="edit_vehicle">
                Vehicle <span className="font-normal text-ink-600">(optional)</span>
              </label>
              <input
                id="edit_vehicle"
                name="vehicle_number"
                type="text"
                defaultValue={customer.vehicle_number ?? ''}
                className="input"
                placeholder="e.g. LEA-1234"
              />
            </div>

            <div>
              <label className="label" htmlFor="edit_phone">
                Phone <span className="font-normal text-ink-600">(optional)</span>
              </label>
              <input
                id="edit_phone"
                name="phone"
                type="tel"
                defaultValue={customer.phone ?? ''}
                className="input"
                placeholder="03xx-xxxxxxx"
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="edit_credit_limit">
              Credit limit <span className="font-normal text-ink-600">(optional)</span>
            </label>
            <NumberInput
              id="edit_credit_limit"
              name="credit_limit"
              step="1"
              min="0"
              defaultValue={customer.credit_limit ?? ''}
              className="input-number"
              placeholder="0"
            />
            <p className="mt-1 text-sm text-ink-600">
              Blank for no limit. Going over it flags them on the list, it does not block a sale.
            </p>
          </div>

          <FormMessage state={showResult ? state : null} />

          <div className="flex gap-2 border-t border-ink-200 pt-3">
            <SubmitButton className="flex-1"  pendingLabel="Saving…">
              Save changes
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
