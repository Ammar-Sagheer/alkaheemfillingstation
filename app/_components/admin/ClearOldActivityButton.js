'use client';

import { useActionState, useEffect, useRef, useState } from 'react';

import { clearOldActivity } from '@/app/_lib/actions';
import { formatDate } from '@/app/_lib/date-helpers';
import SubmitButton from '@/app/_components/ui/SubmitButton';
import FormMessage from '@/app/_components/ui/FormMessage';
import Dialog from '@/app/_components/ui/Dialog';
import Button from '@/app/_components/ui/Button';
import Toast from '@/app/_components/ui/Toast';

/**
 * Throws away the old end of the activity log. Owner only.
 *
 * WHY THIS EXISTS ON A LOG THAT IS APPEND-ONLY. The trail gains a line per
 * change, and on a working day that is dozens. What gets read is the last few
 * weeks; a line from four months ago has never been the answer to anything. Left
 * alone the page becomes hundreds of pages of scrolling with the useful end
 * buried at the top of it.
 *
 * Append-only survives intact, and the shape of this dialog is the reason: the
 * only thing that can be chosen is HOW MUCH TO KEEP, out of four whole periods.
 * There is no way to reach in and remove the one line about the payment somebody
 * backdated on Tuesday while leaving Monday and Wednesday - it is a whole period
 * or nothing, the last month can never be cleared, and the trim writes its own
 * line into the log saying who did it and how many went. The cutoff is worked
 * out in the database, not here; see migration 050.
 *
 * Each period says how many lines it would take. "Older than six months" is a
 * tidy-up at 4 lines and a decision at 4,000, and the owner cannot tell which
 * one he is agreeing to without the number.
 */
const PERIOD_LABELS = {
  1: 'the last month',
  3: 'the last three months',
  6: 'the last six months',
  12: 'the last year',
};

export default function ClearOldActivityButton({ counts }) {
  const [isOpen, setIsOpen] = useState(false);
  const [state, formAction] = useActionState(clearOldActivity, null);
  const [notice, setNotice] = useState(null);
  // A result belongs to the submission that produced it: opening the dialog
  // again starts clean rather than showing what happened last time.
  const [showResult, setShowResult] = useState(false);

  const options = Array.isArray(counts?.options) ? counts.options : [];
  const removable = options.filter((option) => Number(option.count) > 0);

  // Default to the largest clear-out that would actually do something - the
  // owner opening this has too much log, not too little.
  const [keepMonths, setKeepMonths] = useState(() =>
    removable.length > 0 ? String(removable[removable.length - 1].months) : '12',
  );

  const nothingToClear = removable.length === 0;
  const result = showResult ? state : null;

  // Close as soon as the clear comes back. The dialog exists to ask the
  // question; the answer is worth reading once, in the toast, over a page that
  // has already refreshed to show the shorter log.
  const handled = useRef(state);
  useEffect(() => {
    if (state === handled.current) return;
    handled.current = state;

    if (state?.ok) {
      setIsOpen(false);
      setNotice({ message: state.message });
    }
  }, [state]);

  function openDialog() {
    setShowResult(false);
    setNotice(null);
    setKeepMonths(removable.length > 0 ? String(removable[removable.length - 1].months) : '12');
    setIsOpen(true);
  }

  const chosen = options.find((option) => String(option.months) === keepMonths);
  const goingCount = Number(chosen?.count ?? 0);
  const total = Number(counts?.total ?? 0);
  const keptCount = Math.max(total - goingCount, 0);

  return (
    <>
      <Button
        variant="danger"
        type="button"
        onClick={openDialog}
        disabled={nothingToClear}
        title={
          nothingToClear
            ? 'Nothing here is old enough to clear yet'
            : 'Remove entries older than a chosen date'
        }
        className="whitespace-nowrap"
      >
        Clear old entries
      </Button>

      <Dialog
        open={isOpen}
        onClose={() => setIsOpen(false)}
        title="Clear old entries?"
        subtitle={
          <span className="text-sm text-ink-600">
            {total} {total === 1 ? 'entry' : 'entries'} in the log
            {counts?.oldest ? `, going back to ${formatDate(counts.oldest)}` : ''}
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
          <p className="text-base text-ink-700">
            Choose how much of the trail to keep. Everything before that date is removed for good.
            There is no undo, and nothing else in the app is touched.
          </p>

          <fieldset className="space-y-2">
            <legend className="label">Keep</legend>

            {options.map((option) => {
              const months = String(option.months);
              const count = Number(option.count);
              const empty = count === 0;

              return (
                <label
                  key={months}
                  className={[
                    'flex items-start gap-3 rounded-xl border px-3.5 py-3 transition',
                    empty
                      ? 'cursor-not-allowed border-ink-200 bg-ink-50 opacity-60'
                      : keepMonths === months
                        ? 'cursor-pointer border-brand-600 bg-brand-50'
                        : 'cursor-pointer border-ink-200 hover:bg-ink-50',
                  ].join(' ')}
                >
                  <input
                    type="radio"
                    name="keep_months"
                    value={months}
                    disabled={empty}
                    checked={keepMonths === months}
                    onChange={() => setKeepMonths(months)}
                    className="mt-1 h-4 w-4 accent-brand-600"
                  />
                  <span className="min-w-0">
                    <span className="block text-base font-semibold text-ink-900">
                      {PERIOD_LABELS[option.months] ?? `${option.months} months`}
                    </span>
                    <span className="block text-sm text-ink-700">
                      {empty ? (
                        'Nothing is older than this yet'
                      ) : (
                        <>
                          Removes <span className="tabular font-semibold">{count}</span>{' '}
                          {count === 1 ? 'entry' : 'entries'} from before{' '}
                          {formatDate(option.cutoff)}
                        </>
                      )}
                    </span>
                  </span>
                </label>
              );
            })}
          </fieldset>

          <ul className="space-y-2">
            <li className="callout">
              <span className="font-semibold text-ink-900">
                {keptCount} {keptCount === 1 ? 'entry' : 'entries'} stay.
              </span>{' '}
              Only whole periods can go: a single line cannot be picked out and removed, and no
              line can ever be edited.
            </li>
            <li className="callout">
              <span className="font-semibold text-ink-900">The clear-out is itself recorded.</span>{' '}
              A line is written here saying who cleared the log and how many entries went.
            </li>
          </ul>

          {/* Only a failure lands here - a success has already closed this. */}
          <FormMessage state={result} />

          <div className="flex gap-2 border-t border-ink-200 pt-4">
            <SubmitButton
              variant="danger"
              className="flex-1"
              pendingLabel="Clearing…"
              disabled={goingCount === 0}
            >
              Clear {goingCount} {goingCount === 1 ? 'entry' : 'entries'}
            </SubmitButton>
            <Button variant="secondary" type="button" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Carries the result out of the dialog that reported it - how many lines
          went is the part worth seeing, and it would close along with the box. */}
      <Toast notice={notice} onDismiss={() => setNotice(null)} duration={8000} />
    </>
  );
}
