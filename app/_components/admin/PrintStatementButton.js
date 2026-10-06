'use client';

import { useMemo, useState } from 'react';

import Dialog from '@/app/_components/ui/Dialog';
import Button from '@/app/_components/ui/Button';
import StatementPreview from '@/app/_components/admin/StatementPreview';
import {
  statementPresets,
  statementRange,
  accountFromParts,
} from '@/app/_lib/customer-statement';

/**
 * "Print statement" - the page you take when you go to collect.
 *
 * IT SHOWS THE STATEMENT BEFORE IT PRINTS ONE. The first version of this was a
 * range picker and a download button, and the only way to see what you were
 * about to hand someone was to open the file. That is the wrong way round for a
 * document whose whole job is to be checked: the figures belong on screen, where
 * the owner can compare them against the ledger sitting underneath on the same
 * page, and the PDF is what you reach for once they look right.
 *
 * THE PREVIEW IS THE STATEMENT, not a summary of it. `accountFromParts` is the
 * same function the download route calls, running here over rows the server
 * prepared once - so changing the range re-windows in the browser with no round
 * trip, and there is no second implementation to drift out of step.
 *
 * A FROM/TO PAIR, NOT A NUMBER OF DAYS. This offered fixed windows first - 7,
 * 15, 30, 90 days back from today - and the owner asked for dates, because the
 * windows cannot say the thing collecting actually requires. A haulier settling
 * for August wants August: "the last 45 days" drags half of July onto the page
 * and then stops at today rather than at the 31st. `docs/UI_CONVENTIONS.md`
 * already draws this line for the Daily Register - a fixed window answers "how
 * are we doing lately", a from/to pair answers "these particular days, which I
 * chose" - and collecting is the second kind. The chips remain as shortcuts that
 * FILL the boxes, because last month is still the common case.
 *
 * SHORTENING THE PERIOD AT THE START NEVER CHANGES WHAT IS OWED, and the reader
 * can see that rather than being told it: the total stays put while the list
 * shortens and an opening balance appears at the head of it.
 *
 * ENDING IT IN THE PAST DOES, and that is the one thing a day count never had to
 * face. A statement to 31 August closes with the balance as at 31 August, not
 * with what is owed today, and says so - see `accountFromParts`. The preview is
 * where the owner sees which of the two he has asked for, before anyone else
 * does.
 *
 * A PLAIN <a> AND NO `download` ATTRIBUTE. Same reasoning as the Excel export on
 * the Reports page: the route sets Content-Disposition itself, so the file saves
 * anyway, while a failure is free to redirect back here and put the reason on
 * screen. With `download` the browser writes whatever comes back straight to
 * disk, and the owner gets a junk file instead of a sentence.
 */
export default function PrintStatementButton({
  customerId,
  customerName,
  balance = 0,
  account,
  asOf,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const presets = useMemo(() => statementPresets(asOf), [asOf]);

  /*
   * A half-typed date must not narrow the statement. A native date box fires
   * `change` as soon as its three segments hold something, so typing 2026 reports
   * 0006 on the way - the same trap DateJump documents, and here it would quietly
   * redraw the preview against the year 6 mid-keystroke. `statementDate` returns
   * null for anything that is not a plausible date, and null means "no limit at
   * this end", which is the safe reading: it lists more, never less.
   */
  const range = useMemo(() => statementRange(from, to), [from, to]);

  const statement = useMemo(
    () =>
      account
        ? accountFromParts(account, {
            asOf,
            balance: Number(balance ?? 0),
            from: range.from,
            to: range.to,
          })
        : null,
    [account, asOf, balance, range.from, range.to],
  );

  const query = new URLSearchParams();
  if (range.from) query.set('from', range.from);
  if (range.to) query.set('to', range.to);
  const href = `/admin/customers/${customerId}/statement${
    query.toString() ? `?${query.toString()}` : ''
  }`;

  const active = presets.find(
    (preset) => preset.from === (range.from ?? '') && preset.to === (range.to ?? ''),
  );

  function choose(preset) {
    setFrom(preset.from);
    setTo(preset.to);
  }

  /*
   * Either end pushes the other rather than being refused, the same rule
   * `<RegisterRange>` follows: dragging the start past the end is how somebody
   * asks for a later period, not a mistake to be told off for. The invalid state
   * is therefore unreachable here, and `statementRange` swaps them again on the
   * server because a query string is not a control.
   */
  function changeFrom(next) {
    setFrom(next);
    if (next && to && next > to) setTo(next);
  }

  function changeTo(next) {
    setTo(next);
    if (next && from && next < from) setFrom(next);
  }

  return (
    <>
      <Button variant="secondary" type="button" onClick={() => setIsOpen(true)}>
        Print statement
      </Button>

      <Dialog
        open={isOpen}
        onClose={() => setIsOpen(false)}
        size="lg"
        title="Statement of account"
        subtitle={
          <span className="text-sm text-ink-600">
            {customerName}&rsquo;s account: every fill and every payment, with what is owed after
            each. Check it here, then download the PDF to hand over, send on, or keep.
          </span>
        }
      >
        <div className="space-y-4 p-5">
          {/* ---- the period: two dates, with chips that fill them ----

              The chips are shortcuts, not modes. They set the boxes below and
              the boxes stay editable, so "Last month" then nudging the end date
              by a day is one tap and one change rather than starting again. A
              chip lights up whenever the dates happen to match it, including
              after they were typed by hand.

              Blank means no limit at that end, which is why "The whole account"
              is simply both boxes empty rather than a mode of its own. */}
          <div>
            <p className="label mb-2">Which period should the statement cover?</p>

            <div className="mb-3 flex flex-wrap gap-2">
              {presets.map((preset) => {
                const isActive = active?.key === preset.key;
                return (
                  <button
                    key={preset.key}
                    type="button"
                    onClick={() => choose(preset)}
                    aria-pressed={isActive}
                    className={`min-h-11 rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                      isActive
                        ? 'border-brand-600 bg-brand-50 text-brand-800'
                        : 'border-ink-200 bg-white text-ink-700 hover:border-ink-300 hover:bg-ink-50'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            {/* THE TWO DATES KEEP THEIR OWN ROW, and Clear drops below them when
                there is not room for all three. A native date box has an
                intrinsic width and CLIPS rather than shrinking when it is given
                less: at 400px the first build of this read "08/01/202" in both
                boxes, losing the year, which is the one part of a date that
                settles an argument about an old fill. Same lesson as the Date
                column in the PDF, which was widened off a date rather than off
                the word "Date". The min-width on the pair is what forces the
                wrap; the one on each box is what stops the clipping. */}
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex min-w-[19rem] flex-1 gap-3">
                <div className="min-w-[9rem] flex-1">
                  <label className="label" htmlFor={`statement-from-${customerId}`}>
                    From
                  </label>
                  <input
                    id={`statement-from-${customerId}`}
                    type="date"
                    value={from}
                    max={to || asOf}
                    onChange={(event) => changeFrom(event.target.value)}
                    className="input min-h-11 w-full"
                  />
                </div>
                <div className="min-w-[9rem] flex-1">
                  <label className="label" htmlFor={`statement-to-${customerId}`}>
                    To
                  </label>
                  <input
                    id={`statement-to-${customerId}`}
                    type="date"
                    value={to}
                    min={from || undefined}
                    max={asOf}
                    onChange={(event) => changeTo(event.target.value)}
                    className="input min-h-11 w-full"
                  />
                </div>
              </div>
              {/* Clearing both is how you get back to the whole account, and
                  emptying a native date box by hand is fiddly on a tablet. */}
              <Button
                variant="secondary"
                type="button"
                onClick={() => choose(presets[0])}
                disabled={!from && !to}
              >
                Clear
              </Button>
            </div>

            <p className="mt-2 text-sm text-ink-600">
              {range.from || range.to
                ? 'Anything before the start date is included in the balance brought forward, so the statement still adds up.'
                : 'Every fill and every payment on the account, from the first entry.'}
            </p>
          </div>

          {statement ? (
            <StatementPreview statement={statement} customerName={customerName} />
          ) : (
            <p className="callout">
              The statement will list every fill taken and every payment received, oldest first.
            </p>
          )}

          <div className="sticky bottom-0 flex gap-2 border-t border-ink-200 bg-white pt-3">
            <Button
              component="a"
              href={href}
              variant="primary"
              sx={{ flex: 1 }}
              onClick={() => setIsOpen(false)}
            >
              Download PDF
            </Button>
            <Button variant="secondary" type="button" onClick={() => setIsOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
