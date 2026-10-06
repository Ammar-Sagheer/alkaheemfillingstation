'use client';

import { useActionState } from 'react';

import { deleteExpense } from '@/app/_lib/actions';
import ConfirmAction from '@/app/_components/ui/ConfirmAction';

/**
 * Owner-only. An expense feeds the monthly profit figure, so a mistyped amount
 * quietly distorts it - this is how it gets corrected.
 *
 * Confirms first, like the delivery delete: removing money from the books
 * should not happen from a stray tap on a phone.
 */
export default function DeleteExpenseButton({ expenseId, summary }) {
  const [state, formAction] = useActionState(deleteExpense, null);

  return (
    <ConfirmAction
      triggerLabel="Delete this expense"
      title="Delete this expense?"
      confirmLabel="Yes, delete"
      pendingLabel="Deleting…"
      action={formAction}
      state={state}
      hidden={{ expense_id: expenseId }}
    >
      <p>
        Delete <span className="font-semibold text-ink-900">{summary}</span>?
      </p>
    </ConfirmAction>
  );
}
