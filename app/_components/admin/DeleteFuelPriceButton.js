'use client';

import { useActionState } from 'react';

import { deleteFuelPrice } from '@/app/_lib/actions';
import ConfirmAction from '@/app/_components/ui/ConfirmAction';

/**
 * Owner-only. The only way to correct a mistyped rate.
 *
 * A fuel and a date carry one rate, enforced by a unique constraint, so saving
 * again over the top is refused - which leaves the wrong price standing for the
 * whole day unless it can be removed first.
 *
 * The confirmation says what removing it does to readings already entered,
 * because that is the part that would otherwise be guessed at: since migration
 * 066 the days this rate covered fall back to the rate before it, and their
 * readings are re-priced to match, in the same step.
 */
export default function DeleteFuelPriceButton({ priceId, summary }) {
  const [state, formAction] = useActionState(deleteFuelPrice, null);

  return (
    <ConfirmAction
      triggerLabel="Delete this rate"
      title="Remove this rate?"
      confirmLabel="Yes, remove"
      pendingLabel="Removing…"
      action={formAction}
      state={state}
      hidden={{ price_id: priceId }}
    >
      <p>
        Remove <span className="font-semibold text-ink-900">{summary}</span>?
      </p>
      {/* The part that would otherwise be assumed. It has room to be a full
          sentence here, which it did not have squeezed into a table cell. */}
      <p className="callout-warn">
        Readings already entered on the days this rate covers are re-priced to the rate before it.
        You are told which days changed.
      </p>
    </ConfirmAction>
  );
}
