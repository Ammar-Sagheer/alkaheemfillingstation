'use client';

import { useEffect, useRef } from 'react';

/**
 * A confirmation that shows itself and then gets out of the way.
 *
 * For results worth seeing once. A success message left sitting in a form is
 * still there when the next entry is being typed, so it stops describing what
 * just happened and starts describing something unrelated - which is exactly
 * how "Payment recorded across 2 accounts" ends up hanging over a deposit of 7.
 *
 * Failures do NOT belong here. An error has to survive long enough to be acted
 * on, so those stay inline next to the field that caused them.
 *
 * `notice` is an object rather than a string so that the same message twice in
 * a row is still two notices: a new object restarts the timer, where an equal
 * string would leave the first one to expire and the second to vanish early.
 */
export default function Toast({ notice, onDismiss, duration = 6000 }) {
  // Held in a ref so the timer depends only on the notice. An inline arrow for
  // onDismiss changes identity every render, which would restart the countdown
  // every render and mean it never actually fired.
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => dismissRef.current?.(), duration);
    return () => clearTimeout(timer);
  }, [notice, duration]);

  return (
    // The live region is always mounted, empty or not. A screen reader will not
    // announce a region that appears at the same moment as its content.
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4"
    >
      {notice ? (
        <div
          className="pointer-events-auto flex max-w-md items-start gap-3 rounded-lg border
                     border-brand-200 bg-brand-50 px-4 py-3 text-sm font-medium text-brand-800
                     shadow-lg"
        >
          <span>{notice.message}</span>
          <button
            type="button"
            onClick={() => dismissRef.current?.()}
            aria-label="Dismiss"
            className="-mr-1 shrink-0 rounded px-1 leading-none text-brand-700 hover:bg-brand-100"
          >
            ✕
          </button>
        </div>
      ) : null}
    </div>
  );
}
