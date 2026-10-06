'use client';

import { useActionState, useEffect, useRef, useState } from 'react';

import { setNozzleWiring } from '@/app/_lib/actions';
// format-helpers, NOT helpers: this is a client component, and helpers.js
// reads request cookies for the role checks, so it can never enter a browser
// bundle. formatLitres was moved across for exactly this import.
import { formatLitres } from '@/app/_lib/format-helpers';
import { formatDate } from '@/app/_lib/date-helpers';
import Dialog from '@/app/_components/ui/Dialog';
import FormMessage from '@/app/_components/ui/FormMessage';
import SubmitButton from '@/app/_components/ui/SubmitButton';
import Toast from '@/app/_components/ui/Toast';
import NumberInput from '@/app/_components/ui/NumberInput';
import Button from '@/app/_components/ui/Button';

/**
 * Where each pump stands, which tank it draws from, and where its meter
 * started - behind a dialog for the same reason a bank account is: set once
 * when the pump goes onto the system and then almost never touched again.
 *
 * ONE form for all the rows, not one per row. Describing how the place is
 * plumbed is a single job, and six Save buttons made it look like six - with
 * the row you had just edited indistinguishable from the five you had not. One
 * button also means one write, which is what stops half the nozzles ending up
 * pointing at the new tanks and half at the old.
 *
 * THE UNIT NUMBER AND THE LABEL ARE EDITABLE (058), and that is what makes one
 * form load-bearing rather than merely tidy. Rearranging a forecourt is almost
 * always a SWAP - the petrol pump becomes Unit 1 and the diesel one becomes
 * Unit 2 - which passes through a moment where two nozzles both claim position
 * 1. Saved as two writes that is refused halfway, in an order the owner cannot
 * fix by trying again; saved as one it is a single deferred check at the end,
 * when the forecourt is whole again.
 *
 * REPLACED NOZZLES ARE LISTED TOO, and only their caption can be edited. They
 * still hold their old position for the days they worked, so leaving them out
 * would make the swap above impossible - you cannot move a pump into position 1
 * while something else still occupies it. Their tank and starting meter stay
 * read-only: those are arithmetic behind readings that are already in the
 * books, not captions.
 *
 * SO IS THE STARTING METER, ONCE THE NOZZLE HAS TRADED - for the opposite
 * reason to the tank's. The tank was frozen because changing it rewrites the
 * past; this is frozen because changing it does NOTHING, and says so with a
 * green tick. It is consulted until that nozzle's first saved day and is dead
 * data after (012), so an owner adjusting it later gets a success message and
 * no change anywhere. The recovery path is real and is named in the notice
 * above: delete the day, fix the meter, enter the day again.
 *
 * AND THE TANK IS READ-ONLY ON ANY NOZZLE THAT HAS TRADED (060), retired or
 * not. It was the one field here that could quietly rewrite the past: it says
 * which tank every litre that nozzle ever sold came out of, with no date on it,
 * so re-pointing a pump that had been trading all August moved a month of
 * petrol into the diesel tank. That is a replacement - a date dividing before
 * from after - and the dialog next door already does it properly.
 */
export default function NozzleSettingsButton({ nozzles, tanks }) {
  const formRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [notice, setNotice] = useState(null);
  // A result belongs to the submission that produced it; reopening starts clean
  // rather than showing what happened last time.
  const [showResult, setShowResult] = useState(false);

  const [state, formAction] = useActionState(setNozzleWiring, null);

  const handled = useRef(state);
  useEffect(() => {
    if (state === handled.current) return;
    handled.current = state;

    if (state?.ok) {
      setIsOpen(false);
      setNotice({ message: state.message });
    }
  }, [state]);

  return (
    <>
      <Button variant="secondary"
        type="button"
        onClick={() => {
          setShowResult(false);
          setIsOpen(true);
        }}
      >
        <span aria-hidden="true" className="text-base leading-none">
          ✎
        </span>
        Edit nozzle wiring
      </Button>

      <Dialog
        open={isOpen}
        onClose={() => setIsOpen(false)}
        size="lg"
        title="Nozzle wiring"
        subtitle={
          <span className="text-sm text-ink-600">
            Where each pump stands, which tank it draws from, and where its meter started
          </span>
        }
      >
        <form
          ref={formRef}
          action={(formData) => {
            setShowResult(true);
            formAction(formData);
          }}
          className="space-y-4 p-5"
        >
          <p className="text-base text-ink-700">
            Change the unit number and nozzle label to match how the forecourt is arranged now.
            The tank decides which stock a sale comes out of, so it can only be picked before that
            nozzle has its first day entered; the starting reading is only used until then too.
          </p>

          <p className="callout">
            <span className="font-semibold">Renaming applies to the whole history.</span> A pump
            renumbered here shows under its new number on every day, including days already
            entered, which is right when the pumps have been moved around and you will never
            think of it by the old number again. For a pump that was actually swapped out for
            different hardware, use{' '}
            <span className="font-semibold">Replace this unit</span> instead: that keeps the old
            readings under the old pump and starts the new one from its own meter.
          </p>

          {/* THE TWO NOTICES ARE THE TWO WAYS THIS DIALOG CAN LIE ABOUT THE
              PAST, and they share one remedy, so they read as one box. Split
              into three the panel became a wall the owner scrolls past to reach
              the table - and the tank rule is the one he most needs to have
              read, because it is the one that moved a month of August. */}
          <p className="callout">
            <span className="font-semibold">So does the fuel a pump draws.</span> The tank is fixed
            once a nozzle has days entered against it, because it is what decides which stock every
            one of those days came out of: changing it would move months of litres from one tank
            to the other. A pump re-piped onto another fuel is a replacement too: give the old fuel
            its last day and the new fuel its first, and carry the meter across at the figure it
            stands at.
          </p>

          {/* THE DEADLINE, AND NOW ALSO THE SECOND REASON TO USE IT. A starting
              reading is consulted until that nozzle's first saved day and is
              dead data afterwards (012) - so this is the one field on the page
              with an expiry, and the owner needs to know he is inside it. The
              case that sent him looking was a pump whose meter had crept up
              157 L while it was being shifted, which the old wording (only
              about leaving it at 0) did not cover. */}
          <p className="callout-warn">
            Set a starting reading <span className="font-semibold">before</span>{' '}
            that nozzle’s first day is entered: it is what that first day opens on. Left at 0
            on a pump that has been trading, the first day counts the meter’s whole lifetime as
            one day of sales; set below the true reading, it counts the difference as sales nobody
            paid for. Once the first day is saved the box goes grey, because the figure has moved
            into that reading: to change it then, delete the day on the Readings screen, correct
            the meter here, and enter the day again.
          </p>

          {/* A bordered box rather than a panel: it sits inside the dialog's
              own surface, where a second shadow would read as a card on a
              card. */}
          <div className="overflow-hidden rounded-2xl border border-ink-200">
            <div className="table-scroll mx-0 px-0">
              <table className="w-full min-w-[40rem]">
                <thead>
                  <tr>
                    <th className="th pl-4">Unit</th>
                    <th className="th">Nozzle</th>
                    <th className="th">Draws from</th>
                    <th className="th pr-4">Meter starts at</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {nozzles.map((nozzle) => {
                    const retired = Boolean(nozzle.retired_on);
                    // Has any day been entered against this nozzle. Carried from
                    // getNozzles() as an embedded count rather than derived here,
                    // because the answer is a fact about the books, not about
                    // anything this dialog can see.
                    const traded = (nozzle.readings?.[0]?.count ?? 0) > 0;

                    return (
                      <tr key={nozzle.id} className={retired ? 'bg-ink-50/60' : undefined}>
                        <td className="td pl-4">
                          {/* INSIDE the cell, not a direct child of <tr>. An
                              <input> parented by a row is invalid HTML, and the
                              browser does not merely warn - it hoists the element
                              out of the table on parse, which silently reorders
                              the very sequence the index alignment below depends
                              on. Caught as a hydration error in dev.

                              `nozzle_id`, `unit_number` and `nozzle_label` repeat
                              their names down the table. A form serialises
                              repeated names in markup order, so the action lines
                              those three lists up by index. The two frozen fields
                              further down cannot join that scheme - a replaced
                              row omits them, which would shorten their lists and
                              shift every row after it - so they carry the id in
                              their name instead. */}
                          <input type="hidden" name="nozzle_id" value={nozzle.id} />
                          {/* Named with aria-label, NOT an sr-only <label>: an
                              sr-only element in a body cell is positioned against
                              the page rather than the table's scroller, and one
                              once widened a whole page on a phone (see "Never an
                              sr-only label in a table's body cell"). */}
                          <NumberInput
                            id={`unit-${nozzle.id}`}
                            name="unit_number"
                            aria-label={`Unit number for the nozzle currently called unit ${nozzle.unit_number} nozzle ${nozzle.nozzle_label}`}
                            defaultValue={nozzle.unit_number}
                            min="1"
                            step="1"
                            required
                            className="input tabular w-20 py-1.5"
                          />
                        </td>

                        <td className="td">
                          <input
                            id={`label-${nozzle.id}`}
                            name="nozzle_label"
                            aria-label={`Label for the nozzle currently called unit ${nozzle.unit_number} nozzle ${nozzle.nozzle_label}`}
                            defaultValue={nozzle.nozzle_label}
                            maxLength={12}
                            required
                            className="input w-20 py-1.5"
                          />
                          {/* WITH ITS DATE, not just the word. After a
                              replacement the list holds two rows reading "2 · A"
                              and two reading "2 · B", and the only thing that
                              tells the old diesel pump from the new one is when
                              each was on the forecourt. "replaced" alone left the
                              reader to work out which of two identical rows he
                              was renumbering. */}
                          {retired ? (
                            <span className="mt-1 block whitespace-nowrap text-sm text-ink-600">
                              Replaced {formatDate(nozzle.retired_on)}
                            </span>
                          ) : nozzle.commissioned_on ? (
                            <span className="mt-1 block whitespace-nowrap text-sm text-ink-600">
                              Fitted {formatDate(nozzle.commissioned_on)}
                            </span>
                          ) : null}
                        </td>

                        {/* THE TANK IS FROZEN THE MOMENT THE NOZZLE HAS TRADED
                            (060), not merely when it is retired. tank_id is a
                            single undated fact, and every litre this nozzle has
                            ever sold is counted against whichever tank it names
                            RIGHT NOW - so changing it here rewrites months of
                            stock, gain/loss and litres-by-fuel silently, which is
                            what happened to August on 2 Sep 2026. Read-only
                            rather than hidden, for the same reason a replaced
                            row's is: the owner is renumbering this row and needs
                            to see WHICH pump it is. */}
                        {retired || traded ? (
                          <td className="td whitespace-nowrap text-ink-700">
                            {nozzle.tank?.name ?? 'No tank'}
                            {!retired ? (
                              <span className="mt-0.5 block text-sm text-ink-600">
                                Set: this nozzle has days entered
                              </span>
                            ) : null}
                          </td>
                        ) : (
                          <td className="td">
                            <select
                              id={`tank-${nozzle.id}`}
                              name={`tank_id__${nozzle.id}`}
                              aria-label={`Tank for unit ${nozzle.unit_number} nozzle ${nozzle.nozzle_label}`}
                              defaultValue={nozzle.tank_id ?? ''}
                              className="input w-auto py-1.5"
                            >
                              {tanks.map((tank) => (
                                <option key={tank.id} value={tank.id}>
                                  {tank.name}
                                </option>
                              ))}
                            </select>
                          </td>
                        )}

                        {/* FROZEN ONCE THE NOZZLE HAS TRADED, and the reasoning
                            here was wrong the first time round. It was left
                            editable because a starting reading is dead data after
                            the first saved day (012), so changing it can do no
                            HARM - which missed that it also does no GOOD, in a
                            box that looks exactly as live as the one above it.
                            The owner asked, in as many words, whether he could
                            come back and adjust this figure if his accountant
                            found a smaller difference. He can, until the first
                            day is entered; after that the same edit saves
                            cleanly, reports success, and changes nothing on any
                            screen. A field that quietly stops working is worse
                            than one that is disabled - this file's own rule, from
                            the tank cell two rows up. So it says where the figure
                            lives now instead. */}
                        {retired || traded ? (
                          <td className="td tabular whitespace-nowrap pr-4 text-ink-700">
                            {formatLitres(nozzle.starting_reading)}
                            {/* whitespace-normal: the cell is nowrap so the litres
                                figure never breaks mid-number, and that was
                                holding this caption on one line too - wide enough
                                to be clipped at the edge of the dialog's own
                                scroller. */}
                            {!retired ? (
                              <span className="mt-0.5 block whitespace-normal text-sm font-normal text-ink-600">
                                Fixed: the first day holds it
                              </span>
                            ) : null}
                          </td>
                        ) : (
                          <td className="td pr-4">
                            <NumberInput
                              id={`start-${nozzle.id}`}
                              name={`starting_reading__${nozzle.id}`}
                              aria-label={`Starting meter reading for unit ${nozzle.unit_number} nozzle ${nozzle.nozzle_label}`}
                              defaultValue={nozzle.starting_reading ?? 0}
                              min="0"
                              step="0.01"
                              required
                              className="input tabular w-36 py-1.5"
                            />
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* A failure stays put; a success has already closed the dialog. */}
          <FormMessage state={showResult ? state : null} />

          <div className="flex gap-2 border-t border-ink-200 pt-4">
            <SubmitButton className="flex-1"  pendingLabel="Saving…">
              Save wiring
            </SubmitButton>
            <Button variant="secondary" type="button" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </Dialog>

      <Toast notice={notice} onDismiss={() => setNotice(null)} />
    </>
  );
}
