'use client';

import { useEffect, useState } from 'react';

import Dialog from '@/app/_components/ui/Dialog';
import IconButton from '@/app/_components/ui/IconButton';
import SubmitButton from '@/app/_components/ui/SubmitButton';
import Button from '@/app/_components/ui/Button';

/**
 * "Are you sure?" as a dialog, for every destructive action in the app.
 *
 * WHY NOT INLINE, WHICH IS WHAT ALL SEVEN OF THESE USED TO BE. Each one
 * replaced its own trash icon with a question, two buttons and sometimes a
 * paragraph of explanation - inside a table cell. A 44px icon became a
 * three-line block, so the row grew, its column widened, and every row below
 * it jumped down the page. On the Customers table the row you were aiming at
 * moved while you were reading the question, which is the worst possible
 * moment for the page to shift.
 *
 * A dialog costs nothing in the row and has three things the inline version
 * could not have: room for the sentence that explains what will actually
 * happen, focus trapping and Escape from the browser, and a page behind it
 * that does not move at all.
 *
 * THE TRIGGER STAYS AN ICON. The row already names what the action applies to
 * - see IconButton for why that is the one place an icon may stand alone -
 * and the dialog then repeats the name in words before anything happens.
 *
 * The caller keeps its own `useActionState`, so each action has its own
 * pending state and its own error message; this only owns the open/closed
 * state and the chrome. On success the row usually vanishes and this unmounts
 * with it, but a delete that leaves the row in place still needs closing, so
 * `state.ok` does it explicitly.
 *
 * A REFUSAL KEEPS THE DIALOG OPEN. Most of these can be turned down by the
 * database - a customer who still owes money, a purchase a later reading
 * depends on - and the message explaining why is the only part of the
 * interaction that matters. Closing on failure would throw it away.
 */
export default function ConfirmAction({
  triggerIcon = 'trash',
  triggerLabel,
  // A word instead of the icon (Salaries' phone cards: "Cancel" beside a
  // payment). The icon stays the default; triggerLabel is still the name a
  // screen reader hears, so it says what is being cancelled.
  triggerText,
  title,
  confirmLabel,
  pendingLabel,
  confirmDisabled = false,
  action,
  state,
  hidden = {},
  onClose,
  children,
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state]);

  function close() {
    setOpen(false);
    onClose?.();
  }

  return (
    <>
      {triggerText ? (
        <button
          type="button"
          aria-label={triggerLabel}
          onClick={() => setOpen(true)}
          className="inline-flex min-h-10 items-center px-1 text-sm font-semibold text-ink-700 underline underline-offset-2 hover:text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          {triggerText}
        </button>
      ) : (
        <IconButton
          name={triggerIcon}
          label={triggerLabel}
          tone="danger"
          onClick={() => setOpen(true)}
        />
      )}

      <Dialog open={open} onClose={close} title={title}>
        <form action={action} className="flex flex-col gap-4 p-5">
          {Object.entries(hidden).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}

          <div className="space-y-3 text-base text-ink-700">{children}</div>

          {state?.ok === false ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-base leading-snug text-red-800">
              {state.message}
            </p>
          ) : null}

          {/* Cancel first in the DOM would take focus before the destructive
              button, which sounds safer and is not: the browser focuses the
              first element either way, and putting Cancel there means Enter
              dismisses a dialog someone opened deliberately. Escape and the
              header ✕ are the ways out, and both are one key or one tap. */}
          <div className="flex flex-wrap gap-2 border-t border-ink-200 pt-4">
            <SubmitButton
              disabled={confirmDisabled}
              variant="danger" className="flex-1 disabled:cursor-not-allowed disabled:opacity-50" 
              pendingLabel={pendingLabel}
            >
              {confirmLabel}
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
