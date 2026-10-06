'use client';

import { useActionState } from 'react';

import { deleteTreasuryEntry } from '@/app/_lib/actions';
import ConfirmAction from '@/app/_components/ui/ConfirmAction';

/**
 * Removes one line from the safe's sheet. Owner only.
 *
 * Confirms rather than deleting on a tap, the same as the bank transaction and
 * the expense - and with more reason here, because this is the one delete in
 * the app that moves a figure the reader can see. Every balance below the row
 * shifts by its amount, so a stray tap does not lose one line, it re-writes
 * the rest of the page.
 *
 * That is also why the confirmation says so in words instead of only naming
 * the row. If the shift would take the safe below zero at any point the
 * database refuses the delete outright and names the line it broke on; this
 * text is about the ordinary case, where it simply succeeds.
 */
export default function DeleteTreasuryEntryButton({ entryId, summary }) {
  const [state, formAction] = useActionState(deleteTreasuryEntry, null);

  return (
    <ConfirmAction
      triggerLabel="Delete this entry"
      title="Delete this entry?"
      confirmLabel="Yes, delete"
      pendingLabel="Deleting…"
      action={formAction}
      state={state}
      hidden={{ entry_id: entryId }}
    >
      <p>
        Delete <span className="font-semibold text-ink-900">{summary}</span>?
      </p>
      <p className="mt-2">
        Every balance below this line moves by that amount, and so does what the safe is shown as
        holding now.
      </p>
    </ConfirmAction>
  );
}
