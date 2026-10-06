'use client';

import { useOptimistic, useState, useTransition } from 'react';

import { setPurchasePaymentStatus } from '@/app/_lib/actions';

/**
 * Whether a delivery has been paid for. Owner only - staff see a plain badge.
 *
 * Both options are always on screen with the current one filled in, so the
 * state and the fact that it can be changed are the same piece of information.
 * A dropdown hid the current value behind a click, and a single pill did not
 * look pressable at all.
 *
 * The highlight is driven by useOptimistic, which means it moves the instant
 * you tap and then defers to whatever the server actually saved. An earlier
 * version kept the choice in the DOM while colouring from the server prop, so a
 * failed or racing save left the control showing "Paid" over a row the database
 * still had as pending - the one thing a screen about money owed must never do.
 */
const OPTIONS = [
  { value: 'paid', label: 'Paid', selectedClass: 'bg-brand-700 text-white' },
  { value: 'pending', label: 'Pending', selectedClass: 'bg-amber-400 text-amber-950' },
];

/**
 * `kind` says which list the row came from - 'fuel' or 'lubricant' - because
 * the Purchases page shows both in one table. The action needs it to know which
 * table to update; the control itself looks and behaves identically either way.
 */
export default function PaymentStatusToggle({ purchaseId, status, kind = 'fuel' }) {
  const [error, setError] = useState(null);
  const [isSaving, startTransition] = useTransition();
  const [optimisticStatus, setOptimisticStatus] = useOptimistic(status);

  function choose(nextStatus) {
    if (nextStatus === optimisticStatus || isSaving) return;

    setError(null);
    startTransition(async () => {
      setOptimisticStatus(nextStatus);

      const formData = new FormData();
      formData.set('purchase_id', purchaseId);
      formData.set('payment_status', nextStatus);
      formData.set('kind', kind);

      const result = await setPurchasePaymentStatus(null, formData);

      // On failure the optimistic value is dropped automatically when the
      // transition ends, so the control snaps back to what is really stored.
      if (result?.ok === false) setError(result.message);
    });
  }

  return (
    <div>
      <div
        role="group"
        aria-label="Payment status"
        className={`inline-flex items-center gap-0.5 rounded-full border border-ink-200 bg-ink-100 p-0.5 transition ${
          isSaving ? 'opacity-60' : ''
        }`}
      >
        {OPTIONS.map((option) => {
          const selected = optimisticStatus === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => choose(option.value)}
              aria-pressed={selected}
              className={`rounded-full px-3 py-1 text-sm font-semibold transition ${
                selected
                  ? option.selectedClass
                  : 'text-ink-700 hover:bg-white hover:text-ink-900'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {error ? <p className="mt-1 text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
