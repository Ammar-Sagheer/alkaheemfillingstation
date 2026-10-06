'use client';

import { useActionState, useEffect, useRef, useState } from 'react';

import { replaceUnit } from '@/app/_lib/actions';
import Dialog from '@/app/_components/ui/Dialog';
import FormMessage from '@/app/_components/ui/FormMessage';
import SubmitButton from '@/app/_components/ui/SubmitButton';
import Toast from '@/app/_components/ui/Toast';
import NumberInput from '@/app/_components/ui/NumberInput';
import Button from '@/app/_components/ui/Button';
import Icon from '@/app/_components/ui/Icon';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/*
 * Dates are formatted from their own string, never through `new Date(iso)`.
 * That constructor reads a bare `YYYY-MM-DD` as midnight UTC and then prints it
 * in the browser's zone, so a Karachi tablet shows the day before for any date
 * it is handed. The whole app pins the business day to Asia/Karachi for exactly
 * this reason (see date-helpers.js); a client component has no business
 * re-deriving it from the device clock.
 */
function readableDate(iso) {
  // Half-typed or cleared, the sentences below still read as sentences.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return 'the date above';
  const [year, month, day] = iso.split('-');
  return `${Number(day)} ${MONTHS[Number(month) - 1]} ${year}`;
}

/**
 * A unit was damaged and another one put in its place.
 *
 * WHY THIS IS A SEPARATE ACTION AND NOT AN EDIT TO THE NOZZLE WIRING. The
 * wiring dialog next door describes how the forecourt is plumbed - a thing set
 * once and left alone. This describes an EVENT, on a date, that divides the
 * books into before and after: two nozzles stop existing and two others begin,
 * and every reading either side belongs to whichever pump was standing there
 * at the time.
 *
 * The instinct, and the thing this exists to stop, is to reach for the wiring
 * dialog and set the two starting readings back to 0. That does nothing at all
 * - a starting reading is only consulted until a nozzle has its first saved
 * reading (migration 012), so on a nozzle that has been trading for months it
 * is dead data. The owner would set it, see no change, and eventually try to
 * enter a day opening at 0 against a meter that closed at 1,987,279 - which the
 * database refuses, correctly, and with a message about the meter running
 * backwards that explains nothing about what he is actually trying to do.
 *
 * THE SUMMARY PANEL IS THE POINT OF THE DIALOG. This is done once every few
 * years, by someone who will not do it again for a long time, and the two dates
 * are the part that is easy to get subtly wrong. So the form says back, in
 * plain words and before anything is written, exactly which days belong to
 * which pump.
 */
export default function ReplaceUnitButton({ unit, tanks, today }) {
  const [isOpen, setIsOpen] = useState(false);
  const [notice, setNotice] = useState(null);
  const [showResult, setShowResult] = useState(false);

  const [lastDay, setLastDay] = useState(today);
  const [firstDay, setFirstDay] = useState(today);
  const [unitNumber, setUnitNumber] = useState(String(unit.unitNumber));
  // Seeded from the pump being replaced: a new dispenser almost always has the
  // same nozzles on it as the one it stands in for.
  const [labels, setLabels] = useState(() => unit.nozzles.map((n) => n.nozzle_label));

  const [state, formAction] = useActionState(replaceUnit, null);

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
    // Reopening starts from the pump as it stands now, not from whatever was
    // half-typed and abandoned last time.
    setShowResult(false);
    setLastDay(today);
    setFirstDay(today);
    setUnitNumber(String(unit.unitNumber));
    setLabels(unit.nozzles.map((n) => n.nozzle_label));
    setIsOpen(true);
  }

  const datesBackwards = firstDay < lastDay;
  const gapDays =
    /^\d{4}-\d{2}-\d{2}$/.test(lastDay) && /^\d{4}-\d{2}-\d{2}$/.test(firstDay) && !datesBackwards
      ? Math.round((Date.parse(`${firstDay}T00:00:00Z`) - Date.parse(`${lastDay}T00:00:00Z`)) / 86400000)
      : 0;

  const finalUnit = unitNumber.trim() === '' ? unit.unitNumber : Number(unitNumber);

  return (
    <>
      <Button variant="secondary" type="button" onClick={open}>
        <Icon name="fuelPump" className="h-4 w-4" />
        Replace this unit
      </Button>

      <Dialog
        open={isOpen}
        onClose={() => setIsOpen(false)}
        size="lg"
        title={`Replace Unit ${unit.unitNumber}`}
        subtitle={
          <span className="text-sm text-ink-600">
            The old nozzles keep every reading they took; the new ones start on their own meters
          </span>
        }
      >
        <form
          action={(formData) => {
            setShowResult(true);
            formAction(formData);
          }}
          className="space-y-5 p-5"
        >
          <input type="hidden" name="unit_number" value={unit.unitNumber} />

          <p className="text-base text-ink-700">
            Nothing already in the books changes. Unit {unit.unitNumber}’s existing nozzles keep
            every reading, every rupee and every litre they drew out of the tank; they simply stop
            being offered for entry after their last day. The replacement gets nozzles of its own.
          </p>

          {/* ---- the two dates ---- */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor={`last-day-${unit.key}`}>
                Last day the old unit dispensed
              </label>
              <input
                id={`last-day-${unit.key}`}
                name="old_last_day"
                type="date"
                required
                value={lastDay}
                onChange={(event) => setLastDay(event.target.value)}
                className="input"
              />
              <p className="mt-1.5 text-sm text-ink-700">
                Including the changeover day itself, if it sold anything that morning.
              </p>
            </div>

            <div>
              <label className="label" htmlFor={`first-day-${unit.key}`}>
                First day the new unit dispensed
              </label>
              <input
                id={`first-day-${unit.key}`}
                name="new_first_day"
                type="date"
                required
                value={firstDay}
                onChange={(event) => setFirstDay(event.target.value)}
                className="input"
              />
              <p className="mt-1.5 text-sm text-ink-700">
                The same day as above if it was swapped over in one day.
              </p>
            </div>
          </div>

          {/* ---- where the new unit is plumbed ---- */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor={`tank-${unit.key}`}>
                The new unit draws from
              </label>
              <select
                id={`tank-${unit.key}`}
                name="tank_id"
                defaultValue={unit.nozzles[0]?.tank_id ?? ''}
                className="input"
              >
                {tanks.map((tank) => (
                  <option key={tank.id} value={tank.id}>
                    {tank.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label" htmlFor={`number-${unit.key}`}>
                Unit number
              </label>
              <NumberInput
                id={`number-${unit.key}`}
                name="new_unit_number"
                min="1"
                step="1"
                required
                value={unitNumber}
                onChange={(event) => setUnitNumber(event.target.value)}
                className="input tabular"
              />
              <p className="mt-1.5 text-sm text-ink-700">
                Leave it as {unit.unitNumber} if the new pump stands where the old one stood.
              </p>
            </div>
          </div>

          {/* ---- the new unit's nozzles ---- */}
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-ink-900">The new unit’s nozzles</h3>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => setLabels((rows) => [...rows, ''])}
                >
                  Add a nozzle
                </Button>
                {labels.length > 1 ? (
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => setLabels((rows) => rows.slice(0, -1))}
                  >
                    Remove the last
                  </Button>
                ) : null}
              </div>
            </div>

            {/* A bordered box, not a panel, inside the dialog's own surface. */}
            <div className="overflow-hidden rounded-2xl border border-ink-200">
              <div className="table-scroll mx-0 px-0">
                <table className="w-full min-w-[26rem]">
                  <thead>
                    <tr>
                      <th className="th pl-4">Nozzle</th>
                      <th className="th pr-4">Meter starts at</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {labels.map((label, index) => (
                      // The index is the key on purpose: these rows have no
                      // identity of their own until they are saved, and the list
                      // only ever grows or shrinks at the end.
                      // eslint-disable-next-line react/no-array-index-key
                      <tr key={index}>
                        <td className="td pl-4">
                          {/* aria-label, not an sr-only <label>, in a body cell:
                              see NozzleSettingsButton. */}
                          <input
                            id={`label-${unit.key}-${index}`}
                            name="nozzle_label"
                            aria-label={`Label for the new nozzle ${index + 1}`}
                            required
                            maxLength={12}
                            value={label}
                            onChange={(event) =>
                              setLabels((rows) =>
                                rows.map((row, at) => (at === index ? event.target.value : row)),
                              )
                            }
                            className="input w-24 py-1.5"
                          />
                        </td>
                        <td className="td pr-4">
                          <NumberInput
                            id={`start-${unit.key}-${index}`}
                            name="starting_reading"
                            aria-label={`Starting meter reading for the new nozzle ${index + 1}`}
                            defaultValue="0"
                            min="0"
                            step="0.01"
                            required
                            className="input tabular w-40 py-1.5"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* THE THIRD CASE IS THE ONE THAT ACTUALLY HAPPENED, and it was
                missing. On 1 Sep 2026 a pump was moved and its lines ran empty
                while it was being shifted; the meter is a totaliser on the
                outlet, not a measurement of fuel, so it counted 157 L of air.
                The owner entered the old pump's closing figure, because that is
                what the sentence above describes, and the difference only
                surfaced days later. Read what is on the machine NOW - it is the
                one figure that is always right, and it costs nothing to check. */}
            <p className="callout-warn mt-3">
              <span className="font-semibold">
                Type what the meter reads right now, standing at the machine.
              </span>{' '}
              0 for a brand new one. A refurbished unit often arrives with figures already on it,
              and a pump that was moved can have crept up on its own: running dry while it is
              shifted still turns the dial. Anything you put here that is lower than the true
              reading gets counted as sales on the first day entered.
            </p>
          </div>

          {/* ---- what is about to happen, in words ---- */}
          <div className="rounded-xl border border-ink-200 bg-ink-50 px-4 py-3 text-base text-ink-800">
            <p className="mb-2 font-semibold">After saving</p>
            {datesBackwards ? (
              <p className="text-red-800">
                The new unit cannot have started on {readableDate(firstDay)} when the old one was
                still dispensing on {readableDate(lastDay)}.
              </p>
            ) : (
              <ul className="space-y-1">
                <li>
                  Unit {unit.unitNumber}’s {unit.nozzles.length}{' '}
                  {unit.nozzles.length === 1 ? 'nozzle' : 'nozzles'} (
                  {unit.nozzles.map((n) => n.nozzle_label).join(', ')}) can be entered up to and
                  including <span className="font-semibold">{readableDate(lastDay)}</span>, and not
                  after.
                </li>
                <li>
                  Unit {finalUnit || unit.unitNumber} gets {labels.length} new{' '}
                  {labels.length === 1 ? 'nozzle' : 'nozzles'}, enterable from{' '}
                  <span className="font-semibold">{readableDate(firstDay)}</span>.
                </li>
                {gapDays === 0 ? (
                  <li>
                    Both appear on the reading sheet for {readableDate(lastDay)}: the old one for
                    whatever it sold that morning before it was taken out.
                  </li>
                ) : gapDays === 1 ? (
                  <li>The new unit picks up the day after the old one stopped, with no day missing.</li>
                ) : (
                  <li>
                    The {gapDays - 1} {gapDays - 1 === 1 ? 'day' : 'days'} in between{' '}
                    {gapDays - 1 === 1 ? 'has' : 'have'} no Unit {unit.unitNumber} to enter at all,
                    which is right if the pump stood out of service.
                  </li>
                )}
              </ul>
            )}
          </div>

          {/* A failure stays put; a success has already closed the dialog. */}
          <FormMessage state={showResult ? state : null} />

          <div className="flex gap-2 border-t border-ink-200 pt-4">
            <SubmitButton className="flex-1" pendingLabel="Recording…" disabled={datesBackwards}>
              Record the replacement
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
