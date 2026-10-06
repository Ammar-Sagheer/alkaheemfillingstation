'use client';

import { useActionState, useEffect, useRef, useState } from 'react';

import { correctLedgerEntry } from '@/app/_lib/actions';
import SubmitButton from '@/app/_components/ui/SubmitButton';
import FormMessage from '@/app/_components/ui/FormMessage';
import Toast from '@/app/_components/ui/Toast';
import Dialog from '@/app/_components/ui/Dialog';
import NumberInput from '@/app/_components/ui/NumberInput';
import Button from '@/app/_components/ui/Button';
import IconButton from '@/app/_components/ui/IconButton';
import { formatDate } from '@/app/_lib/date-helpers';

const moneyFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const showMoney = (n) => `Rs ${moneyFormat.format(Math.round(n) === 0 ? 0 : n)}`;

/**
 * "I typed it wrong" - for a ledger that cannot be edited.
 *
 * THE BUTTON IS CALLED CORRECT AND NOT EDIT, ON PURPOSE. `ledger_entries`
 * refuses UPDATE and DELETE in the database itself, which is the whole reason
 * a balance here is worth more than one in a notebook - nobody can reach back
 * and quietly change what a man owes. So this posts two new rows instead: one
 * cancelling the wrong entry where it stands, one saying what it should have
 * said. The page has described that in words since the beginning; this is the
 * sentence made into a button.
 *
 * Saying "Edit" and then not editing would be the worse lie. The owner would
 * expect the old row to vanish, find it still sitting there with two more
 * beneath it, and trust the screen less than before.
 *
 * THE BALANCE PREVIEW IS THE POINT OF THE DIALOG, exactly as it is in
 * LedgerAdjustmentForm next door. Correcting Rs 6,000 to Rs 600 and correcting
 * it to Rs 60,000 look identical while you are typing; what the account will
 * say afterwards does not. Somebody who fat-fingers a zero sees the wrong
 * answer before he commits to it, which no amount of careful labelling
 * achieves.
 *
 * THE ROWS THIS IS NOT OFFERED ON are decided by the page, and refused again by
 * the database (063): anything posted automatically from a nozzle reading or a
 * lubricant sale, anything already cancelled, and a cancellation itself.
 */
export default function CorrectEntryButton({ entry, customerId, balance = 0 }) {
  const [isOpen, setIsOpen] = useState(false);
  const [notice, setNotice] = useState(null);
  const [showResult, setShowResult] = useState(false);

  const original = Math.round(Number(entry.amount ?? 0));
  const [amount, setAmount] = useState(String(original));
  const [remove, setRemove] = useState(false);

  const [state, formAction] = useActionState(correctLedgerEntry, null);

  const handled = useRef(state);
  useEffect(() => {
    if (state === handled.current) return;
    handled.current = state;
    if (state?.ok) {
      setIsOpen(false);
      setNotice({ message: state.message });
    }
  }, [state]);

  function open() {
    // Reopening starts from the entry as it stands, not from whatever was
    // half-typed and abandoned last time.
    setShowResult(false);
    setAmount(String(original));
    setRemove(false);
    setIsOpen(true);
  }

  const isDebit = entry.entry_type === 'debit';
  const typed = Number(amount);
  const replacement = remove ? 0 : Number.isFinite(typed) && typed > 0 ? Math.round(typed) : null;

  /*
   * What the account says afterwards. The reversal takes the old entry back out
   * and the replacement puts the new one in, so a debit moves the balance by
   * (new - old) and a credit by (old - new). Worked out here rather than read
   * back from the server because it has to be on screen BEFORE the owner
   * commits, which is the only moment it is any use.
   */
  const current = Number(balance ?? 0);
  const after =
    replacement === null
      ? null
      : current + (isDebit ? replacement - original : original - replacement);

  const unchanged = !remove && replacement === original;

  return (
    <>
      <IconButton
        name="pencil"
        label={`Correct this ${isDebit ? 'entry' : 'payment'} of ${showMoney(original)}`}
        onClick={open}
      />

      <Dialog
        open={isOpen}
        onClose={() => setIsOpen(false)}
        title="Correct this entry"
        subtitle={
          <span className="text-sm text-ink-600">
            Nothing is erased: the old entry is cancelled and the right one recorded beside it
          </span>
        }
      >
        <form
          action={(formData) => {
            setShowResult(true);
            formAction(formData);
          }}
          className="space-y-4 p-5"
        >
          <input type="hidden" name="entry_id" value={entry.id} />
          <input type="hidden" name="customer_id" value={customerId} />

          {/* WHAT IS ON THE LEDGER NOW, spelled out rather than assumed. The
              owner clicked a pencil in a row of a table he may have scrolled;
              this is the confirmation that he is about to change the entry he
              meant, and it is the only place the original amount appears once
              the field below has been typed over. */}
          <div className="figure-box">
            <p className="caption">Recorded now</p>
            <p className="tabular mt-1 text-2xl font-bold text-ink-900">{showMoney(original)}</p>
            <p className="mt-1 text-sm text-ink-600">
              {isDebit ? 'Added to what they owe' : 'Taken off what they owe'} on{' '}
              {formatDate(entry.entry_date)}
              {entry.note ? `, “${entry.note}”` : ''}
            </p>
          </div>

          {!remove ? (
            <>
              <div>
                <label className="label" htmlFor={`correct-amount-${entry.id}`}>
                  What it should have been
                </label>
                <NumberInput
                  id={`correct-amount-${entry.id}`}
                  name="amount"
                  step="1"
                  min="1"
                  required
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  className="input-number"
                  placeholder="0"
                />
              </div>

              <div>
                <label className="label" htmlFor={`correct-date-${entry.id}`}>
                  Date
                </label>
                <input
                  id={`correct-date-${entry.id}`}
                  name="entry_date"
                  type="date"
                  required
                  defaultValue={entry.entry_date}
                  className="input"
                />
              </div>

              <div>
                <label className="label" htmlFor={`correct-note-${entry.id}`}>
                  Note <span className="font-normal text-ink-600">(optional)</span>
                </label>
                <input
                  id={`correct-note-${entry.id}`}
                  name="note"
                  type="text"
                  defaultValue={entry.note ?? ''}
                  className="input"
                  placeholder={isDebit ? 'e.g. fuel from the old register' : 'e.g. cash, received by Imran'}
                />
              </div>
            </>
          ) : null}

          {/* The second case, and a real one: a payment entered twice, or
              against the wrong customer. Kept as a checkbox under the fields
              rather than a separate button, because it is the same decision -
              what should this entry say? - with "nothing" as an answer. */}
          <label className="flex items-start gap-3 rounded-xl border border-ink-200 px-4 py-3">
            <input
              type="checkbox"
              name="remove"
              checked={remove}
              onChange={(event) => setRemove(event.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 rounded border-ink-300 text-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            />
            <span className="text-sm text-ink-800">
              <span className="font-semibold">This entry should not be here at all.</span>
              <span className="mt-0.5 block text-ink-600">
                Cancel it and put nothing in its place: for something entered twice, or against
                the wrong customer.
              </span>
            </span>
          </label>

          {/* The check that matters, in the sentence the owner would say. Same
              shape as the manual adjustment's, deliberately: it is the same
              question about the same number. */}
          {after !== null ? (
            <p className="callout">
              {showMoney(current)} <span aria-hidden="true">→</span>{' '}
              <span className="whitespace-nowrap font-bold text-ink-900">{showMoney(after)}</span>
              <span className="mt-0.5 block text-ink-600">
                {after > 0
                  ? `${showMoney(after)} owed to the pump after this.`
                  : after < 0
                    ? `The pump would owe them ${showMoney(Math.abs(after))} after this.`
                    : 'The account would be settled after this.'}
              </span>
            </p>
          ) : null}

          {unchanged ? (
            <p className="callout-warn">
              That is what the entry already says. Change the amount, or tick the box above to
              cancel it outright.
            </p>
          ) : null}

          <FormMessage state={showResult ? state : null} />

          <div className="flex gap-2 border-t border-ink-200 pt-4">
            <SubmitButton className="flex-1" pendingLabel="Correcting…" disabled={unchanged}>
              {remove ? 'Cancel this entry' : 'Post the correction'}
            </SubmitButton>
            <Button variant="secondary" type="button" onClick={() => setIsOpen(false)}>
              Close
            </Button>
          </div>
        </form>
      </Dialog>

      <Toast notice={notice} onDismiss={() => setNotice(null)} />
    </>
  );
}
