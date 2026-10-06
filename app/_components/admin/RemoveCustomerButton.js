'use client';

import { useActionState, useState } from 'react';

import { deleteCustomer, purgeCustomer, setCustomerActive } from '@/app/_lib/actions';
import ConfirmAction from '@/app/_components/ui/ConfirmAction';
import Dialog from '@/app/_components/ui/Dialog';
import SubmitButton from '@/app/_components/ui/SubmitButton';
import Button from '@/app/_components/ui/Button';

/**
 * Taking a customer off the list, and putting one back.
 *
 * Owner only, and it confirms first - the same treatment as removing a
 * lubricant, for the same reason: what happens next depends on history the
 * person clicking cannot see from the row.
 *
 * THE WORD IS "REMOVE", NOT "DELETE". Only an account that never traded is
 * actually deleted; one with credit or payments behind it is retired, because
 * deleting it would tear a hole in months already reported and exported. The
 * database decides which, so the button cannot promise either - "Remove" is
 * true of both, and the confirmation says what will really happen.
 *
 * The refusal case is the one worth designing for: an account with a balance
 * still on it cannot be removed at all, and the message naming the figure
 * comes straight from the database. So the error is given room to wrap rather
 * than being squeezed onto the end of the row.
 */
export default function RemoveCustomerButton({ customerId, name, balance }) {
  const [state, formAction] = useActionState(deleteCustomer, null);

  /*
   * The same test the database applies, so the dialog can explain itself
   * before the click rather than after it. The database is still the rule -
   * this is the courtesy.
   *
   * ROUNDED TO THE RUPEE, and it has to stay that way. This check was left at
   * a 0.01 threshold when delete_customer moved to whole rupees, and the two
   * promptly disagreed: an account sitting on a 28-paisa residue displayed
   * "Rs 0", warned "this account is not settled", and would then have been
   * removed perfectly happily by the database. A courtesy check that
   * contradicts the rule it is previewing is worse than no check.
   *
   * Three things now round the same way and must be changed together: this,
   * `delete_customer` (migration 032), and `formatPKR` in the Owes column.
   */
  const owes = Number(balance ?? 0);
  // Half away from zero, matching Postgres and formatPKR - Math.round would
  // call a balance of -0.5 settled while the column beside it reads "Rs -1".
  const notSquare = (owes < 0 ? -1 : 1) * Math.round(Math.abs(owes)) !== 0;

  return (
    <ConfirmAction
      triggerLabel={`Remove ${name}`}
      title="Remove this customer?"
      confirmLabel="Yes, remove"
      pendingLabel="Removing…"
      action={formAction}
      state={state}
      hidden={{ customer_id: customerId }}
    >
      {notSquare ? (
        <p className="callout-warn">
          <span className="font-semibold">This account is not settled.</span> Square it on {name}
          &rsquo;s page first: removing it would take the balance off the books, and the database
          will refuse.
        </p>
      ) : null}

      <p>
        Remove <span className="font-semibold text-ink-900">{name}</span>? Anything already on their
        ledger stays on the books.
      </p>
    </ConfirmAction>
  );
}

/** Puts a removed customer back on the list. */
export function RestoreCustomerButton({ customerId }) {
  const [state, formAction] = useActionState(setCustomerActive, null);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="customer_id" value={customerId} />
      <input type="hidden" name="is_active" value="true" />
      {/* A small secondary button. It had link styles written on it and its
          variant left at the default, so MUI drew it as a filled green one. */}
      <SubmitButton variant="secondary" size="small" pendingLabel="Bringing back…">
        Bring back
      </SubmitButton>
      {state?.ok === false ? <span className="text-sm text-red-700">{state.message}</span> : null}
    </form>
  );
}

/**
 * The step past Remove: gone for good, ledger entries and all.
 *
 * ONLY OFFERED ON THE REMOVED LIST, so getting here is always two deliberate
 * decisions rather than one click next to six live customers.
 *
 * TYPING THE NAME is the confirmation, not a Yes button. Everything else
 * destructive in this app is recoverable - a retired customer comes back, a
 * deleted sale posts a reversal - and this one is not, so it asks for
 * something a mis-aimed click cannot produce. The database checks the typed
 * name too; this is the courtesy copy of that rule, and the Submit stays
 * disabled until they match so the refusal is rare rather than routine.
 *
 * Most attempts here are expected to FAIL, and that is the feature working: a
 * customer who ever took fuel on credit cannot be purged at all, because the
 * slip belongs to a day already on the books. The message explaining that
 * comes from the database and needs room, so it wraps under the form.
 */
export function PurgeCustomerButton({ customerId, name }) {
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const [state, formAction] = useActionState(purgeCustomer, null);

  const matches = typed.trim().toLowerCase() === name.trim().toLowerCase();

  function close() {
    setConfirming(false);
    setTyped('');
  }

  /*
   * NOT ConfirmAction, and this is the one place worth the duplication. That
   * component's trigger is a trash icon; this one has to be the words "Delete
   * for good", because it sits beside "Bring back" on the removed list and two
   * icons there would be a guess. The dialog body also owns a text field whose
   * value gates the submit, which is more than a confirmation.
   */
  return (
    <>
      {/* The small danger button, beside Bring back's small secondary one: two
          buttons of one size, the recoverable one first. */}
      <Button variant="danger" size="small" type="button" onClick={() => setConfirming(true)}>
        Delete for good
      </Button>

      <Dialog open={confirming} onClose={close} title="Delete this customer for good?">
        <form action={formAction} className="flex flex-col gap-4 p-5">
          <input type="hidden" name="customer_id" value={customerId} />

          <p className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-base text-red-800">
            <span className="font-semibold">This cannot be undone.</span> Everything typed against{' '}
            {name} goes with them: payments, adjustments, the opening balance.
          </p>

          <div>
            <label className="label" htmlFor={`confirm-${customerId}`}>
              Type <span className="font-semibold text-ink-900">{name}</span> to confirm
            </label>
            <input
              id={`confirm-${customerId}`}
              type="text"
              name="confirm_name"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              className="input"
              autoComplete="off"
            />
          </div>

          {state?.ok === false ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-base leading-snug text-red-800">
              {state.message}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <SubmitButton
              disabled={!matches}
              variant="danger" className="flex-1 disabled:cursor-not-allowed disabled:opacity-50" 
              pendingLabel="Deleting…"
            >
              Delete for good
            </SubmitButton>
            <Button variant="secondary" type="button" onClick={close}>
              Cancel
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
