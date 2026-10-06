'use client';

import { useActionState, useEffect, useRef, useState } from 'react';

import { updateTank } from '@/app/_lib/actions';
import { fuelColor } from '@/app/_lib/fuel-colors';
import SubmitButton from '@/app/_components/ui/SubmitButton';
import FormMessage from '@/app/_components/ui/FormMessage';
import NumberInput from '@/app/_components/ui/NumberInput';
import Dialog from '@/app/_components/ui/Dialog';
import Button from '@/app/_components/ui/Button';
import Toast from '@/app/_components/ui/Toast';
import PendingLink from '@/app/_components/ui/PendingLink';
import TankGauge from '@/app/_components/admin/dashboard/TankGauge';

// helpers.js reaches into request cookies, so a client component cannot import
// it. Same approach as ReadingForm: format inline with Intl.
const litreFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const litres = (value) => `${litreFormat.format(value)} L`;

/**
 * A tank's capacity and opening stock - behind a dialog, for the same reason
 * `NozzleSettingsButton` gives for the wiring: set once when the pump goes
 * onto the system and then almost never touched again. It used to stand open
 * as a full edit form for the tank's whole life, which meant the Tanks
 * section was two four-field forms even on a pump that has not touched either
 * figure in months.
 *
 * WHAT REPLACES THE STANDING FORM is a read card in the same language the
 * Dashboard's own tank cards already use - the accent colour, the dot, the
 * fill gauge against CAPACITY - so "how full is this tank" looks like the
 * same fact wherever it is read. It shows `current_stock_litres`, the book
 * stock right now, which is a different number from the dialog's own gauge
 * (opening stock against capacity, a check on what is about to be SAVED as
 * the starting baseline) - the two never contradict each other because they
 * are not answering the same question.
 */
export default function TankForm({ tank, lastDip }) {
  const [isOpen, setIsOpen] = useState(false);
  const [notice, setNotice] = useState(null);

  const [state, formAction] = useActionState(updateTank, null);

  // Controlled, because the gauge has to move as the numbers are typed - a
  // capacity you have just overshot is worth seeing before you press Save, not
  // after the server turns it down.
  const [capacity, setCapacity] = useState(String(tank.capacity_litres ?? ''));
  const [opening, setOpening] = useState(String(tank.opening_stock_litres ?? ''));
  const [openingDate, setOpeningDate] = useState(tank.opening_stock_date ?? '');

  const stored = [tank.capacity_litres, tank.opening_stock_litres, tank.opening_stock_date].join('|');

  // Re-seed from the server once a save has landed, and close the dialog with
  // a toast rather than leaving it open on a form that already says "Saved" -
  // the same shape as every other dialog this page uses now.
  const seeded = useRef(stored);
  const handled = useRef(state);
  useEffect(() => {
    if (state === handled.current) return;
    handled.current = state;

    if (state?.ok) {
      setIsOpen(false);
      setNotice({ message: state.message });
    }
  }, [state]);

  useEffect(() => {
    if (seeded.current === stored) return;
    seeded.current = stored;
    setCapacity(String(tank.capacity_litres ?? ''));
    setOpening(String(tank.opening_stock_litres ?? ''));
    setOpeningDate(tank.opening_stock_date ?? '');
  }, [stored, tank.capacity_litres, tank.opening_stock_litres, tank.opening_stock_date]);

  const capacityNum = Number(capacity);
  const openingNum = Number(opening);
  const hasFigures =
    capacity !== '' && opening !== '' &&
    Number.isFinite(capacityNum) && capacityNum > 0 &&
    Number.isFinite(openingNum) && openingNum >= 0;

  const overBy = hasFigures ? openingNum - capacityNum : 0;
  const isOver = overBy > 0;
  const filledPercent = hasFigures ? (openingNum / capacityNum) * 100 : 0;

  const color = fuelColor(tank.fuel_type);
  const currentStock = Number(tank.current_stock_litres ?? 0);
  const currentCapacity = Number(tank.capacity_litres ?? 0);
  const currentFill =
    currentCapacity > 0 ? Math.min(100, Math.max(0, (currentStock / currentCapacity) * 100)) : 0;

  return (
    <>
      {/* THE READ CARD - what the page shows day to day, in the Dashboard's
          own tank language (docs/UI_CONVENTIONS.md -> "The new look"): the
          fuel's quiet band with a dot of its true hue, the tank drawn as a
          tank, and the level written out as litres, a percentage and the
          capacity - the gauge is never the only statement of it. */}
      <article data-card className="panel @container flex flex-col overflow-hidden">
        <div className={`flex items-center justify-between gap-3 px-5 py-3 ${color.soft}`}>
          <h3 className="flex min-w-0 items-center gap-2.5 text-lg font-bold">
            <span
              className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-inset ring-black/15"
              style={{ backgroundColor: color.raw }}
              aria-hidden="true"
            />
            {tank.name}
          </h3>
          <Button
            variant="secondary"
            type="button"
            onClick={() => setIsOpen(true)}
            aria-label={`Edit ${tank.name}`}
          >
            Edit
          </Button>
        </div>

        <div className="flex items-center gap-5 px-5 py-5">
          <TankGauge
            fuelType={tank.fuel_type}
            percent={currentFill}
            label={`${tank.name} is about ${Math.round(currentFill)} percent full`}
          />
          <div className="min-w-0 flex-1">
            <p className="caption">In the tank now, by the books</p>
            <p
              className={`tabular mt-0.5 whitespace-nowrap text-2xl font-bold tracking-tight ${
                currentStock < 0 ? 'text-red-700' : 'text-ink-900'
              }`}
            >
              {litres(currentStock)}
            </p>
            <p className="tabular mt-2 text-base text-ink-700">
              <span className="font-semibold text-ink-900">{Math.round(currentFill)}% full</span>
              <span className="mx-1.5 text-ink-400" aria-hidden="true">
                ·
              </span>
              holds <span className="whitespace-nowrap">{litres(currentCapacity)}</span>
            </p>
          </div>
        </div>

        {/* The book figure above is never corrected by a dip - see
            getLastStockCheck's own comment on why - so this line is the check
            on it, not a repeat of it: the last time this tank was physically
            measured, and how far the book was from that measurement on the
            day. */}
        {/* `mt-auto`: Settings makes the tanks in a row one height, and this
            line is where each card ends, so it sits level across the row. */}
        <div className="mt-auto flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-ink-200/70 bg-ink-50 px-5 py-3.5 text-base text-ink-700">
          {lastDip ? (
            <p>
              Last dipped {lastDip.label}
              <span className="mx-1.5 text-ink-400" aria-hidden="true">
                ·
              </span>
              <span
                className={`tabular whitespace-nowrap font-semibold ${
                  lastDip.gainLoss < 0
                    ? 'text-red-700'
                    : lastDip.gainLoss > 0
                      ? 'text-brand-700'
                      : 'text-ink-800'
                }`}
              >
                {lastDip.gainLoss === 0
                  ? 'exact match'
                  : `${lastDip.gainLoss > 0 ? '+' : '\u2212'}${litres(Math.abs(lastDip.gainLoss))}`}
              </span>
            </p>
          ) : (
            <p>Never dipped.</p>
          )}
          <PendingLink
            href="/admin/stock-checks"
            className="font-semibold text-brand-700 underline-offset-2 hover:underline"
          >
            {lastDip ? 'View stock checks' : 'Record the first one'}
          </PendingLink>
        </div>
      </article>

      <Dialog
        open={isOpen}
        onClose={() => setIsOpen(false)}
        title={`Edit ${tank.name}`}
        subtitle={
          <span className="text-sm text-ink-600">
            Capacity and the opening stock this tank started from
          </span>
        }
      >
        <form action={formAction} className="space-y-4 p-5">
          <input type="hidden" name="tank_id" value={tank.id} />

          <div>
            <label className="label" htmlFor={`capacity-${tank.id}`}>
              Capacity (litres)
            </label>
            <NumberInput
              id={`capacity-${tank.id}`}
              name="capacity_litres"
              step="0.01"
              min="1"
              required
              autoFocus
              value={capacity}
              onChange={(event) => setCapacity(event.target.value)}
              className="input-number"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor={`opening-${tank.id}`}>
                Opening stock
              </label>
              <NumberInput
                id={`opening-${tank.id}`}
                name="opening_stock_litres"
                step="0.01"
                min="0"
                required
                value={opening}
                onChange={(event) => setOpening(event.target.value)}
                aria-invalid={isOver}
                aria-describedby={`gauge-${tank.id}`}
                className={`input-number ${
                  isOver ? 'border-red-400 focus:border-red-500 focus:ring-red-200' : ''
                }`}
              />
            </div>
            <div>
              <label className="label" htmlFor={`opening-date-${tank.id}`}>
                From
              </label>
              <input
                id={`opening-date-${tank.id}`}
                name="opening_stock_date"
                type="date"
                required
                value={openingDate}
                onChange={(event) => setOpeningDate(event.target.value)}
                className="input"
              />
            </div>
          </div>

          {/* How full the tank would be. A number typed into a box gives no sense of
              scale; a bar that runs out of room does, and the moment it turns red
              the reason is on screen rather than one save away. */}
          <div id={`gauge-${tank.id}`}>
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <span className="caption">Opening stock against capacity</span>
              <span
                className={`tabular text-sm font-bold ${
                  isOver ? 'text-red-700' : 'text-ink-700'
                }`}
              >
                {hasFigures ? `${Math.round(filledPercent)}%` : null}
              </span>
            </div>

            <div className="h-2 overflow-hidden rounded-full bg-ink-200">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  isOver ? 'bg-red-500' : 'bg-brand-600'
                }`}
                style={{ width: `${Math.min(filledPercent, 100)}%` }}
              />
            </div>

            <p className={`mt-1.5 text-sm ${isOver ? 'font-semibold text-red-700' : 'text-ink-700'}`}>
              {!hasFigures
                ? 'Enter a capacity and an opening stock.'
                : isOver
                  ? `${litres(overBy)} more than this tank holds. Lower the opening stock, or raise the capacity if the tank really is bigger.`
                  : `${litres(openingNum)} in a ${litres(capacityNum)} tank · ${litres(capacityNum - openingNum)} free`}
            </p>
          </div>

          <p className="callout">
            Opening stock is only the starting point before the first dip is recorded. Once a
            physical dip exists, that measured figure becomes the baseline instead.
          </p>

          {/* A failure stays where it happened, until it is dealt with. A
              success leaves as a toast with the dialog. */}
          <FormMessage state={state?.ok === false ? state : null} />

          <div className="flex gap-2 border-t border-ink-200 pt-4">
            <SubmitButton className="flex-1" disabled={isOver} pendingLabel="Saving…">
              {isOver ? 'Opening stock is over capacity' : 'Save tank'}
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
