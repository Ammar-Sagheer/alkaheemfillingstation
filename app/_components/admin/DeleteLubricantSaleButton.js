'use client';

import { useActionState } from 'react';

import { deleteLubricantSale } from '@/app/_lib/actions';
import ConfirmAction from '@/app/_components/ui/ConfirmAction';

/**
 * Owner only, like deleting a nozzle reading.
 *
 * Confirms first, because a sale carrying credit has already moved a customer's
 * balance. The reversal that undoes it is posted by the database in the same
 * transaction as the delete, so there is no state where the row is gone and the
 * debt is still standing.
 */
export default function DeleteLubricantSaleButton({ saleId, summary }) {
  const [state, formAction] = useActionState(deleteLubricantSale, null);

  return (
    <ConfirmAction
      triggerLabel="Delete this sale"
      title="Delete this sale?"
      confirmLabel="Yes, delete"
      pendingLabel="Deleting…"
      action={formAction}
      state={state}
      hidden={{ sale_id: saleId }}
    >
      <p>
        Delete <span className="font-semibold text-ink-900">{summary}</span>?
      </p>
    </ConfirmAction>
  );
}
