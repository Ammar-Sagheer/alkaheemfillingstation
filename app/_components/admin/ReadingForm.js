'use client';

import { useActionState, useEffect, useRef, useState } from 'react';

import { saveReading, deleteReading } from '@/app/_lib/actions';
import SubmitButton from '@/app/_components/ui/SubmitButton';
import FormMessage from '@/app/_components/ui/FormMessage';
import FuelBadge from '@/app/_components/ui/FuelBadge';
import NumberInput from '@/app/_components/ui/NumberInput';
import ReadingChainWarning from '@/app/_components/admin/ReadingChainWarning';
import { formatRate, saleAmount as exactSaleAmount } from '@/app/_lib/format-helpers';
import { shiftISODate, formatDateLong } from '@/app/_lib/date-helpers';
import Dialog from '@/app/_components/ui/Dialog';
import Icon from '@/app/_components/ui/Icon';
import { fuelColor } from '@/app/_lib/fuel-colors';
import Button from '@/app/_components/ui/Button';

/*
 * Formatting is done inline here rather than imported from helpers.js: that
 * module reaches into request cookies for the role checks, so it cannot be
 * pulled into a browser bundle. Anything the server needs to format the same
 * way lives in format-helpers.js instead - see formatRate above.
 */
const litreFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
/*
 * Meter readings always carry two decimals; litres sold do not.
 *
 * A pump meter is a physical dial with a tenths digit, so 1,987,128.80 and
 * 1,987,279.95 are the same shape of number. Formatted with a bare
 * maximumFractionDigits the first lost its trailing zero and rendered as
 * 1,987,128.8 - a digit shorter than the figure directly beside it, in a
 * tabular font whose whole job is to keep the columns aligned. On a screen
 * read in a hurry against cash in a drawer, that is how a digit gets misread.
 */
const meterFormat = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const moneyFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

const showLitres = (n) => `${litreFormat.format(n || 0)} L`;
const showMoney = (n) => `Rs ${moneyFormat.format(n || 0)}`;
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/*
 * WHAT THE SCREEN SHOWS HAS TO BE WHAT GETS SAVED. `round2(litres * rate)` is a
 * floating-point multiplication of the two figures Postgres multiplies in
 * `numeric`, and on a half-paisa they disagree: 197.75 L at Rs 371.90 is
 * exactly Rs 73,543.2250, which the database rounds to .23 and a double rounds
 * to .22. That one paisa used to make the reading unsaveable (migration 052);
 * now that the database derives the cash itself it cannot, but the cash-in-hand
 * figure the owner checks against the notes in the drawer would still be a
 * paisa out from the books. Use the exact one for anything that is money.
 */

/**
 * One nozzle, as a compact row that opens a dialog.
 *
 * Six full-height forms stacked on one page meant a lot of scrolling, and -
 * worse - six near-identical forms in view at once, which is exactly how a
 * closing reading ends up typed into the wrong nozzle. Collapsed to rows, the
 * whole day fits on one screen and entry happens with everything else out of
 * the way.
 *
 * A dialog rather than an expanding row: an accordion pushes the rows below it
 * down and yanks them back on collapse, so you lose your place after every
 * save, and the credit slip list makes the page reflow as it grows.
 */
export default function ReadingForm({
  row,
  date,
  customers,
  creditSales,
  canDelete,
  showUnit = true,
}) {
  const isSaved = Boolean(row.reading_id);
  const [isOpen, setIsOpen] = useState(false);

  // Close once the save has gone through and come back from the server.
  const savedRef = useRef(isSaved);
  useEffect(() => {
    if (isSaved && !savedRef.current) setIsOpen(false);
    savedRef.current = isSaved;
  }, [isSaved]);

  const num = (value) => (value === null || value === undefined ? null : Number(value));

  const previousClosing = num(row.previous_closing);
  const laterOpening = num(row.later_opening);
  const closing = num(row.closing_reading);
  const openingUsed = Number(row.opening_reading ?? 0);

  /*
   * WHAT COUNTS AS A BROKEN CHAIN.
   *
   * This used to be `Boolean(row.later_date) || openingDoesNotMatch`, and the
   * first half of that was wrong: later_date only means "a reading exists on
   * some later date", which is true of every nozzle on every past day the
   * moment you carry on entering. Opening any earlier date painted Check on
   * all six rows at once, and a warning that is always on is a warning nobody
   * reads - including on the one row where it mattered.
   *
   * A meter is continuous, so the chain is intact when each reading opens
   * exactly where the one before it closed. Three ways that fails:
   *
   *   1. this day's opening is not the previous day's closing
   *   2. this day IS saved, but the next reading does not open where this one
   *      closed - the two overlap or leave a hole
   *   3. this day is NOT saved and a later reading already exists, so saving
   *      here back-fills underneath it and risks counting the litres twice
   *
   * A later reading that opens exactly where this day closes is the chain
   * working, which is the case that used to shout.
   */
  const openingDoesNotFollow = previousClosing !== null && openingUsed !== previousClosing;
  const nextDoesNotFollow =
    isSaved && laterOpening !== null && closing !== null && laterOpening !== closing;
  const backFillingUnderALaterDay = !isSaved && Boolean(row.later_date);

  const hasChainProblem = openingDoesNotFollow || nextDoesNotFollow || backFillingUnderALaterDay;

  const title = `Unit ${row.unit_number} · Nozzle ${row.nozzle_label}`;

  /*
   * The row drops "Unit 1 ·" when the list is already grouped under a Unit
   * heading - repeating it on both cards under that heading is the clutter the
   * grouping was meant to remove.
   *
   * The DIALOG always keeps the full name. It opens over the whole page with
   * the heading out of sight, and it is the one place where being sure which
   * nozzle you are typing into actually matters.
   */
  const rowTitle = showUnit ? title : `Nozzle ${row.nozzle_label}`;

  // A quiet accent, not a filled band - the same rationing as the Dashboard's
  // fuel cards. A row of six nozzles in solid colour would be louder than a
  // list is meant to be; the rule (see fuel-colors.js) is that the loud
  // treatment is earned only where typing into the wrong card corrupts
  // something, which is the Stock page's dip boxes, not this list.
  const color = fuelColor(row.fuel_type);

  return (
    <>
      {/*
       * A ROW INSIDE ITS UNIT'S CARD, not a card of its own.
       *
       * Six identically-shaped full-width cards stacked down the page had no
       * rhythm to them and gave the unit grouping nothing to be - "Unit 1"
       * was a caption floating above two slabs rather than the physical pump
       * those two nozzles are bolted to. The card is the unit now (see
       * readings/page.js) and this is one row in it, so the page reads as
       * three pumps rather than six unrelated forms.
       *
       * WHICH FUEL THIS IS, TWICE OVER. This row is the surface the owner
       * named when he asked for the two fuels to be unmistakable: a reading
       * typed against the wrong nozzle is the mistake being designed out. So
       * it carries the fuel in two independent ways - an 8px rail down the
       * left in the fuel's dark relative (blue against rust, a hue
       * difference), and the badge beside the name (dark blue with white
       * letters against light orange with dark letters, a lightness AND a
       * letter-colour difference). The rail uses `color.border`, not
       * `color.accent`, which is `border-t-*` and paints only a top rule; and
       * not `color.solid` either, because diesel's light orange is 1.6:1 on
       * white and would be an invisible rail. See fuel-colors.js.
       *
       * DONE IS THE TINTED ONE, and it used to be the other way round. An
       * amber wash on the rows still to enter was right when the fuels were
       * teal and yellow, but diesel is orange now and an amber row behind an
       * orange rail is mud - the colour budget on this row belongs to the
       * fuel.
       *
       * ENTERED IS NOW THE FUEL'S OWN TINT, not a faint green. The green was
       * too close to white to read as a state at all - the owner's report was
       * "no clear differentiation whether reading entered or not" - and it
       * spent a second colour on a card that already had one. Washing an
       * entered card in its own fuel colour says both things with one cue: a
       * finished diesel nozzle is unmistakably diesel AND unmistakably done,
       * and an un-entered one stays white and stands out against its filled
       * neighbours.
       *
       * This inverts which state is loud. That is deliberate and it is the
       * owner's call: he wants to SEE at a glance that a day has been
       * entered. The white cards still read as the odd ones out on a
       * part-finished day, so nothing is lost for the person working down the
       * page - the Enter chip and the border still carry the word and the
       * edge.
       *
       * `tint` and not `soft`: soft brings a text colour with it, and every
       * money figure in this card has to stay near-black.
       */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={`@container flex h-full w-full flex-col rounded-2xl border-l-[6px] border-t border-r border-b text-left shadow-sm transition
                   focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600
                   ${color.border}
                   ${
                     isSaved
                       ? `${color.tint} ${color.border} hover:brightness-[0.97]`
                       : 'border-y-ink-200 border-r-ink-200 bg-white hover:border-y-ink-300 hover:border-r-ink-300 hover:bg-ink-50'
                   }`}
      >
        {/* WRAPS RATHER THAN TRUNCATES. Built without this, at 400px the icon,
            the badge and the Enter chip took the row between them and the name
            was clipped to "Noz..." - the one word on the card identifying WHICH
            nozzle you are about to type into, on the screen where typing into
            the wrong one is the mistake everything else here is arranged to
            prevent.

            `whitespace-nowrap` on the name and `flex-wrap` on the row together
            set the priority: the name cannot be shortened or broken, so when
            the four things do not fit it is the CHIP that drops to a second
            line. Without the nowrap the name simply wrapped instead, and
            "Nozzle A" came out stacked as "Nozzle" over "A", which is not
            hidden but is not a name anyone reads at a glance either. */}
        <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-2 px-4 pb-3 pt-4">
          {/*
           * WHICH FUEL, SAID A THIRD TIME AND SAID LOUDEST. The owner's brief
           * was that it must be obvious at a glance where each fuel's nozzles
           * are, and a word on a badge is not a glance.
           *
           * A drawn pump rather than a photograph: it takes the fuel's own hue
           * from `fuel-colors.js`, so it cannot drift out of step with the
           * badge beside it or the unit band above it the way an image file
           * would, it stays sharp on the tablet's screen, and it adds nothing
           * to download. `soft` is the pale-tint-with-dark-text pair, which is
           * legible for BOTH fuels - `solid` would put dark-on-dark for petrol
           * here.
           *
           * It is never the only cue: the badge still says the word, the card
           * still carries the fuel's colour down its left edge, and the unit
           * header above names the fuel too. Somebody who cannot separate the
           * blue from the orange loses nothing.
           */}
          <span
            className="icon-tile h-10 w-10 bg-white/80 ring-1 ring-inset ring-black/5"
            aria-hidden="true"
          >
            <Icon name="fuelPump" className={`h-6 w-6 ${color.onWhite}`} />
          </span>
          <span className="flex-1 whitespace-nowrap text-lg font-bold text-ink-900">{rowTitle}</span>
          <FuelBadge fuelType={row.fuel_type} />
          {hasChainProblem ? (
            <span className="badge bg-red-100 text-red-800">
              <Icon name="warning" className="h-4 w-4" />
              Check
            </span>
          ) : null}

          {/* Green for done, NEUTRAL for still-to-do. This chip was amber
              until diesel became orange; a pale amber chip beside an orange
              fuel badge on the same row is two warm colours competing to be
              noticed, and the fuel has to win that. Slate says "not yet"
              without claiming any of the colour the fuels now own.

              The chevron that used to sit after it is gone. On a full-width
              row it pointed at the far edge and was the only thing saying
              "this opens"; on a card the whole tile is obviously the target,
              and the chip already carries the word. */}
          <span
            className={`badge shrink-0 ${
              isSaved ? 'bg-brand-100 text-brand-800' : 'bg-ink-200 text-ink-800'
            }`}
          >
            <Icon name={isSaved ? 'check' : 'pencil'} className="h-4 w-4" />
            {isSaved ? 'Entered' : 'Enter'}
          </span>
        </div>

        {/* Every number gets its own label. The old single line read
            "100 L · Rs 30,000 · cash Rs 30,000", which needs someone to
            already know which figure is which.

            TWO COLUMNS, ALWAYS - not four across a full-width row. The nozzle
            is a card about a third of the page wide now, so four columns would
            give each figure ~60px and break "Rs 235,653" across two lines. Two
            by two also puts the pair that must agree - total sale, and the cash
            plus credit under it - directly above one another. */}
        {/* `border-black/10`, not an ink token: this rule has to sit on white
            AND on whichever fuel tint an entered card is wearing, and a fixed
            slate hairline goes muddy over orange. */}
        {/* Two columns once the card is 19rem wide; one figure per row below
            that, label left and figure right. At 360px two columns left
            "Rs 1,538,860" about 110px - the old card hid that by truncating
            the figure, which is the one thing a money figure may never do. */}
        <dl className="grid w-full grid-cols-1 gap-x-4 gap-y-2 border-t border-black/10 px-4 pb-4 pt-3 @[19rem]:grid-cols-2 @[19rem]:gap-y-3">
          {isSaved ? (
            <>
              <RowFigure label="Fuel sold" value={showLitres(row.litres_sold)} strong />
              <RowFigure label="Total sale" value={showMoney(row.sale_amount)} strong />
              <RowFigure label="Cash in hand" value={showMoney(row.cash_amount)} />
              <RowFigure
                label="On credit"
                value={showMoney(Number(row.credit_amount) > 0 ? row.credit_amount : 0)}
                tone={Number(row.credit_amount) > 0 ? 'credit' : 'muted'}
              />
            </>
          ) : (
            <>
              <RowFigure label="Meter starts at" value={meterFormat.format(openingUsed)} strong />
              {/* "/ litre" lives in the caption, not in the figure. At the
                  readable type size "Rs 336.34 / litre" no longer fits the
                  half-width column this gives it, and it was truncating to
                  "Rs 336.34 / lit..." - hiding part of a number to make room
                  for a unit that never changes. */}
              <RowFigure
                label="Rate a litre"
                value={row.rate ? formatRate(row.rate) : 'Not set'}
                tone={row.rate ? undefined : 'warn'}
              />
              <div className="text-sm font-medium text-ink-700 @[19rem]:col-span-2">
                Tap to enter the closing meter reading.
              </div>
            </>
          )}
        </dl>
      </button>

      <Dialog
        open={isOpen}
        onClose={() => setIsOpen(false)}
        title={title}
        subtitle={
          <div className="flex items-center gap-2">
            <FuelBadge fuelType={row.fuel_type} />
            <span className="text-sm text-ink-600">{formatDayLabel(date)}</span>
          </div>
        }
      >
        {isSaved ? (
          <SavedReading row={row} date={date} creditSales={creditSales} canDelete={canDelete} />
        ) : (
          <EntryForm row={row} date={date} customers={customers} />
        )}
      </Dialog>
    </>
  );
}

/**
 * One labelled figure in a nozzle row. The label is the point: it is what
 * turns "100 L" into "Fuel sold: 100 L".
 */
function RowFigure({ label, value, strong, tone }) {
  // Muted is ink-600, the floor for anything meant to be read: it carries a
  // real "Rs 0" now, where it only ever carried a dash.
  const valueTone =
    tone === 'muted'
      ? 'text-ink-600'
      : tone === 'warn'
        ? 'text-amber-700'
        : tone === 'credit'
          ? 'text-ink-900'
          : 'text-ink-900';

  return (
    <div className="flex min-w-0 items-baseline justify-between gap-3 @[19rem]:block">
      {/* The new look's sentence-case caption. The figure is nowrap and never
          `truncate`: a money figure cut to "Rs 1,53..." is a wrong figure, and
          the card's two columns are wide enough for a seven-figure day
          (checked by rendering). */}
      <dt className="caption">{label}</dt>
      <dd className={`figure-value whitespace-nowrap ${strong ? '' : 'font-semibold'} ${valueTone}`}>
        {value}
      </dd>
    </div>
  );
}

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function formatDayLabel(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return String(iso);
  return `${String(d).padStart(2, '0')} ${MONTH_NAMES[m - 1]} ${y}`;
}

// ---------------------------------------------------------------------------
// Already entered - show what was recorded
// ---------------------------------------------------------------------------

function SavedReading({ row, date, creditSales, canDelete }) {
  const [state, formAction] = useActionState(deleteReading, null);

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* A saved row can still be part of a broken chain - flag it here rather
          than leaving it to be found in a stock loss weeks later. */}
      <ReadingChainWarning row={row} date={date} openingUsed={row.opening_reading} />

      {/* THE RATE IS ON SCREEN, and laid out as the sum it is: Sold beside the
          rate, the Total under both. It was missing, so a Total that was not
          litres x the day's price in Settings could not be explained from here:
          27 Sep's 236.2 L came to Rs 98,221 because it was saved at Rs 415.84
          before the new 412.25 was set (migration 066). `row.rate` is the rate
          THIS READING was saved at, not today's price. */}
      <dl className="grid grid-cols-2 gap-3">
        <Figure label="Opening" value={meterFormat.format(row.opening_reading)} />
        <Figure label="Closing" value={meterFormat.format(row.closing_reading)} />
        <Figure label="Sold" value={showLitres(row.litres_sold)} strong />
        <Figure label="Rate a litre" value={row.rate ? formatRate(row.rate) : 'Not set'} />
        <Figure label="Total" value={showMoney(row.sale_amount)} strong className="col-span-2" />
        <Figure label="Cash" value={showMoney(row.cash_amount)} />
        <Figure label="Credit" value={showMoney(row.credit_amount)} />
      </dl>

      {creditSales.length > 0 ? (
        <div className="rounded-2xl border border-ink-200 bg-ink-50 p-4">
          <p className="mb-2 text-base font-semibold text-ink-800">Credit slips</p>
          <ul className="space-y-1.5 text-base">
            {creditSales.map((slip) => (
              <li key={slip.id} className="flex items-baseline justify-between gap-3">
                <span className="truncate text-ink-800">{slip.customer?.name ?? 'Unknown'}</span>
                <span className="tabular shrink-0 text-ink-600">
                  {showLitres(slip.litres)} · {showMoney(slip.amount)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <FormMessage state={state} />

      {canDelete ? (
        <form action={formAction} className="pt-1">
          <input type="hidden" name="reading_id" value={row.reading_id} />
          <SubmitButton variant="danger" fullWidth pendingLabel="Deleting…">
            Delete this reading
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}

function Figure({ label, value, strong, className = '' }) {
  return (
    <div className={`rounded-xl bg-ink-50 px-3.5 py-2.5 ring-1 ring-inset ring-ink-200/70 ${className}`}>
      <dt className="caption">{label}</dt>
      <dd
        className={[
          'tabular mt-0.5 whitespace-nowrap',
          strong ? 'text-xl font-bold text-ink-900' : 'text-lg font-semibold text-ink-800',
        ].join(' ')}
      >
        {value}
      </dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Not yet entered - the form
// ---------------------------------------------------------------------------

function EntryForm({ row, date, customers }) {
  const [state, formAction] = useActionState(saveReading, null);

  const opening = Number(row.opening_reading ?? 0);
  const rate = Number(row.rate ?? 0);

  const [closing, setClosing] = useState('');
  const [lines, setLines] = useState([]);
  const [skipConfirmed, setSkipConfirmed] = useState(false);

  const closingValue = closing === '' ? null : Number(closing);
  const hasClosing = closingValue !== null && Number.isFinite(closingValue);

  const litres = hasClosing ? round2(closingValue - opening) : 0;
  const saleAmount = exactSaleAmount(litres, rate);
  const creditTotal = round2(lines.reduce((total, line) => total + (Number(line.amount) || 0), 0));
  const cashAmount = round2(saleAmount - creditTotal);

  const meterWentBackwards = hasClosing && closingValue < opening;
  const creditExceedsSale = hasClosing && cashAmount < 0;

  /*
   * OVERLAPPING THE NEXT DAY. A meter only moves forwards, so two readings for
   * one nozzle describe two separate spans of it. They overlap - and so count
   * the same litres twice - when the next reading starts before this one
   * finishes.
   *
   * This is the mistake that put about 1,678 litres and Rs 577,000 on the
   * books twice in August 2026: a day entered against the 7th, then the same
   * meter figures entered again against the 6th, with nothing removing the
   * first. There was a warning in this dialog at the time and it was correct;
   * it was also ignorable, so it was ignored.
   *
   * The rule that actually stops it is a trigger on nozzle_readings (migration
   * 026) - this check only stops the trip to the server and explains the
   * problem while the closing reading is still on screen. If the two ever
   * disagree, the database is right.
   */
  const nextOpening =
    row.later_opening === null || row.later_opening === undefined
      ? null
      : Number(row.later_opening);
  const overlapsNextDay = hasClosing && nextOpening !== null && nextOpening < closingValue;

  /*
   * A GAP BEHIND THIS DAY. `previous_date` is the nearest EARLIER reading for
   * this nozzle - not necessarily yesterday. When it isn't, one or more whole
   * days in between were never opened, which is exactly how a real evening
   * went wrong here: the day before this one was skipped, and this one was
   * saved without anyone noticing.
   *
   * Not a block - migration 027 allows entering a day that leaves a genuine
   * gap behind it, because backfilling that gap later is a legitimate repair
   * that looks identical on the wire. This is the deliberate-or-mistake fork:
   * saving is refused until the checkbox below is ticked, so it takes a
   * conscious action to skip a day rather than an unnoticed one.
   */
  const expectedPreviousDate = shiftISODate(date, -1);
  const hasDateGap = Boolean(row.previous_date) && row.previous_date !== expectedPreviousDate;
  const missingFrom = hasDateGap ? shiftISODate(row.previous_date, 1) : null;
  const missingDayLabel =
    missingFrom === expectedPreviousDate
      ? formatDateLong(missingFrom)
      : `${formatDateLong(missingFrom)} to ${formatDateLong(expectedPreviousDate)}`;

  const canSubmit =
    rate > 0 &&
    hasClosing &&
    !meterWentBackwards &&
    !creditExceedsSale &&
    !overlapsNextDay &&
    (!hasDateGap || skipConfirmed);

  function addLine() {
    setLines((current) => [
      ...current,
      { key: crypto.randomUUID(), customer_id: '', litres: '', amount: '' },
    ]);
  }

  function updateLine(key, patch) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function removeLine(key) {
    setLines((current) => current.filter((line) => line.key !== key));
  }

  /*
   * THE AMOUNT IS TYPED; THE LITRES ARE WORKED OUT. This used to run the other
   * way - litres in, amount computed - and the owner had it turned round,
   * which matches how the slip is actually written at the pump: a customer
   * asks for "two thousand rupees of diesel", the attendant serves it and
   * writes the rupees down. The litres are the consequence, not the input.
   *
   * BOTH STAY EDITABLE. The derived side is filled in for you and can then be
   * overwritten, because a slip is occasionally rounded off by hand and the
   * paper in the drawer is what the books have to agree with - not what the
   * rate says it should have been.
   *
   * A guard on the rate rather than a bare divide: `rate` is null until the
   * day's price is set, and dividing by it would put `Infinity` in a field
   * that goes to the database. No rate means the litres are simply left for
   * the reader to type.
   */
  function onAmountChange(key, value) {
    const asNumber = Number(value);
    const canDerive = Number.isFinite(asNumber) && value !== '' && Number(rate) > 0;
    updateLine(key, {
      amount: value,
      litres: canDerive ? String(round2(asNumber / Number(rate))) : '',
    });
  }

  return (
    <form action={formAction} className="flex flex-col gap-4 p-4">
      <input type="hidden" name="nozzle_id" value={row.nozzle_id} />
      <input type="hidden" name="reading_date" value={date} />
      <input type="hidden" name="opening_reading" value={opening} />
      <input type="hidden" name="rate_per_litre" value={rate} />
      <input
        type="hidden"
        name="credit_lines"
        value={JSON.stringify(
          lines.map(({ customer_id, litres: l, amount }) => ({
            customer_id,
            litres: Number(l),
            amount: Number(amount),
          })),
        )}
      />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className="label">Opening</span>
          <p className="tabular rounded-lg border border-ink-200 bg-ink-100 px-3 py-3 text-xl font-semibold text-ink-700">
            {meterFormat.format(opening)}
          </p>
        </div>
        <div>
          <label className="label" htmlFor={`closing-${row.nozzle_id}`}>
            Closing
          </label>
          <NumberInput
            id={`closing-${row.nozzle_id}`}
            // Without a name the field is not submitted at all, however it
            // looks on screen - the server would only ever see an empty value.
            name="closing_reading"
            step="0.01"
            min={opening}
            required
            value={closing}
            onChange={(event) => setClosing(event.target.value)}
            className="input-number"
            placeholder="0.00"
          />
        </div>
      </div>

      {meterWentBackwards ? (
        <p className="text-sm font-medium text-red-700">
          The closing reading is below the opening reading of {meterFormat.format(opening)}.
        </p>
      ) : null}

      {overlapsNextDay ? (
        <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
          The reading already saved for {formatDayLabel(row.later_date)} starts at{' '}
          {meterFormat.format(nextOpening)}, before this day would close at{' '}
          {meterFormat.format(closingValue)}, so{' '}
          {litreFormat.format(round2(closingValue - nextOpening))} litres would be counted on both
          days. Clear {formatDayLabel(row.later_date)} on Readings first, then enter this day again.
        </p>
      ) : null}

      {/* Says so before saving if this day does not join onto its neighbours. */}
      <ReadingChainWarning row={row} date={date} openingUsed={opening} />

      {hasDateGap ? (
        <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2.5 text-sm text-red-900">
          <p className="font-medium">
            {missingDayLabel} has no reading saved for this nozzle. Saving this day will jump
            straight over it.
          </p>
          <label className="mt-2 flex items-start gap-2 font-medium">
            <input
              type="checkbox"
              checked={skipConfirmed}
              onChange={(event) => setSkipConfirmed(event.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-red-400 text-red-700 focus:ring-red-600"
            />
            Yes, {missingDayLabel} was missed on purpose. Save this day anyway.
          </label>
        </div>
      ) : null}

      {rate > 0 ? (
        <p className="text-sm text-ink-600">
          Rate: <span className="tabular font-semibold text-ink-700">{formatRate(rate)}</span> per
          litre
        </p>
      ) : (
        <p className="text-sm font-medium text-amber-800">
          No rate is set for {row.fuel_type} on this date, so this nozzle cannot be saved yet.
        </p>
      )}

      {/* Running total, so a mistyped digit is obvious before saving.

          It was a near-black block; the new look has no black surfaces (the
          owner's brief from the start was "no blacks"), so it is the nozzle's
          own fuel tint with the figures at 24px near-black - still the
          loudest thing in the dialog, which is its job, and now saying which
          fuel it is adding up as well. `tint` not `soft`: the figures stay ink. */}
      <div className={`grid grid-cols-2 gap-3 rounded-2xl px-4 py-3.5 ring-1 ring-inset ring-black/5 ${fuelColor(row.fuel_type).tint}`}>
        <div>
          <p className="caption text-ink-700">Sold</p>
          <p className="tabular whitespace-nowrap text-2xl font-bold text-ink-900">{showLitres(litres)}</p>
        </div>
        <div>
          <p className="caption text-ink-700">Value</p>
          <p className="tabular whitespace-nowrap text-2xl font-bold text-ink-900">{showMoney(saleAmount)}</p>
        </div>
      </div>

      {/* ---- credit slips ---- */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-base font-semibold text-ink-800">Credit slips</span>
          {/* The main action on this card once the meter is in, so it is given
              the brand colour rather than the pale secondary style - it was
              easy to miss against the rest of the form. */}
          <button
            type="button"
            onClick={addLine}
            className="inline-flex items-center gap-1.5 rounded-lg border border-brand-300
                       bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-700 transition
                       hover:border-brand-500 hover:bg-brand-100
                       focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            <span aria-hidden="true" className="text-base leading-none">
              +
            </span>
            Add customer
          </button>
        </div>

        {lines.length === 0 ? (
          <p className="text-sm text-ink-600">
            None yet, so the whole amount is treated as cash. Took fuel on credit? Add them above.
          </p>
        ) : (
          <ul className="space-y-2">
            {lines.map((line) => (
              <li key={line.key} className="rounded-2xl border border-ink-200 bg-ink-50 p-3">
                <div className="flex gap-2">
                  <select
                    required
                    aria-label="Customer"
                    value={line.customer_id}
                    onChange={(event) => updateLine(line.key, { customer_id: event.target.value })}
                    className="input py-2 text-sm"
                  >
                    <option value="">Choose customer…</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name}
                        {customer.vehicle_number ? ` (${customer.vehicle_number})` : ''}
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="secondary"
                    size="small"
                    type="button"
                    onClick={() => removeLine(line.key)}
                    aria-label="Remove this slip"
                    className="shrink-0"
                  >
                    ✕
                  </Button>
                </div>
                {/* AMOUNT FIRST, LITRES SECOND - the typed field leads and the
                    derived one follows it, so the pair reads in the order it
                    is filled in. The placeholders say which is which; swapping
                    two identical-looking number boxes without swapping their
                    labels is how a rupee figure ends up in the litres column. */}
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <NumberInput
                    step="0.01"
                    min="0"
                    required
                    aria-label="Amount"
                    placeholder="Amount"
                    value={line.amount}
                    onChange={(event) => onAmountChange(line.key, event.target.value)}
                    className="input tabular py-2 text-sm"
                  />
                  <NumberInput
                    step="0.01"
                    min="0"
                    required
                    aria-label="Litres"
                    placeholder="Litres"
                    value={line.litres}
                    onChange={(event) => updateLine(line.key, { litres: event.target.value })}
                    className="input tabular py-2 text-sm"
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ---- the split ---- */}
      <div className="grid grid-cols-2 gap-3 rounded-2xl border border-ink-200 p-4">
        <div>
          <p className="caption">Cash</p>
          <p
            className={[
              'tabular mt-0.5 whitespace-nowrap text-xl font-bold',
              creditExceedsSale ? 'text-red-700' : 'text-ink-900',
            ].join(' ')}
          >
            {showMoney(cashAmount)}
          </p>
        </div>
        <div>
          <p className="caption">Credit</p>
          <p className="tabular mt-0.5 whitespace-nowrap text-xl font-bold text-ink-900">{showMoney(creditTotal)}</p>
        </div>
      </div>

      {creditExceedsSale ? (
        <p className="text-sm font-medium text-red-700">
          The slips come to more than this nozzle sold. Check the litres and amounts.
        </p>
      ) : (
        <p className="text-sm text-ink-600">
          Cash is worked out for you. Check it against the notes in the drawer before saving.
        </p>
      )}

      <FormMessage state={state} />

      <SubmitButton fullWidth disabled={!canSubmit}>
        Save nozzle
      </SubmitButton>
    </form>
  );
}
