'use client';

import { useActionState } from 'react';

import { deleteBankTransaction } from '@/app/_lib/actions';
import ConfirmAction from '@/app/_components/ui/ConfirmAction';

/**
 * Removes one transaction. Owner only.
 *
 * Confirms inline like the expense delete: an amount typed in the wrong
 * direction moves the balance twice over, so this gets used - but not from a
 * stray tap on a phone.
 */
export default function DeleteBankTransactionButton({ transactionId, summary }) {
  const [state, formAction] = useActionState(deleteBankTransaction, null);

  return (
    <ConfirmAction
      triggerLabel="Delete this transaction"
      title="Delete this transaction?"
      confirmLabel="Yes, delete"
      pendingLabel="Deleting…"
      action={formAction}
      state={state}
      hidden={{ transaction_id: transactionId }}
    >
      <p>
        Delete <span className="font-semibold text-ink-900">{summary}</span>?
      </p>
    </ConfirmAction>
  );
}
