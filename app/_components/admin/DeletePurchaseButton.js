'use client';

import { useActionState } from 'react';

import { deletePurchase } from '@/app/_lib/actions';
import ConfirmAction from '@/app/_components/ui/ConfirmAction';

/**
 * Owner-only. The way to correct a mistyped delivery: remove it and record it
 * again. Stock recalculates itself from history, so the correction flows
 * straight through to the stock and gain/loss figures.
 *
 * Two taps rather than one - deleting a delivery moves the stock figures, so it
 * should not happen from a stray tap on a phone.
 *
 * `kind` tells the action which list this row belongs to, since fuel and
 * lubricant purchases share one table on screen.
 */
export default function DeletePurchaseButton({ purchaseId, summary, kind = 'fuel' }) {
  const [state, formAction] = useActionState(deletePurchase, null);

  return (
    <ConfirmAction
      triggerLabel="Delete this purchase"
      title="Delete this delivery?"
      confirmLabel="Yes, delete"
      pendingLabel="Deleting…"
      action={formAction}
      state={state}
      hidden={{ purchase_id: purchaseId, kind }}
    >
      <p>
        Delete <span className="font-semibold text-ink-900">{summary}</span>?
      </p>
    </ConfirmAction>
  );
}
