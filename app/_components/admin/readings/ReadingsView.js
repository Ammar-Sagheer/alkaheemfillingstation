import Icon from '@/app/_components/ui/Icon';
import ReadingForm from '@/app/_components/admin/ReadingForm';
import ClearDayButton from '@/app/_components/admin/ClearDayButton';
import ReadingsCashUpBar from '@/app/_components/admin/ReadingsCashUpBar';
import DayHeader from '@/app/_components/admin/dashboard/DayHeader';
import KpiCard from '@/app/_components/admin/dashboard/KpiCard';
import Notice from '@/app/_components/admin/dashboard/Notice';

import { todayISO, shiftISODate, formatDate, formatDateLong } from '@/app/_lib/date-helpers';
import { formatLitres, formatPKR, formatRate, sumMoney } from '@/app/_lib/format-helpers';
import { fuelColor, NEUTRAL_FUEL } from '@/app/_lib/fuel-colors';

/**
 * The daily entry screen, drawn - in the new look the Dashboard set.
 *
 * WHAT DID NOT CHANGE, ON PURPOSE. This page has more reverted designs recorded
 * against it than any other (docs/UI_CONVENTIONS.md): a day-completion strip
 * built three ways and removed, inline entry built and reverted ("model window
 * was better"), a dark strip across the top. None of that comes back. The unit
 * is still the card, entry is still a dialog with one nozzle in it, the unit
 * header still wears its fuel's band, entered nozzles are still washed in their
 * fuel's tint, and the cash-up bar still appears only once the totals at the
 * top have scrolled away. What changed is the surface: the day header, the
 * figure cards, the panels, the warnings and the dialog's insides.
 */
export default function ReadingsView({
  date,
  sheet,
  customers,
  creditSalesByReading,
  ratesInForce = {},
  isOwner,
  afterMidnight = false,
}) {
  const today = todayISO();

  const done = sheet.filter((row) => row.reading_id);

  /* The day's totals, added in paisa by sumMoney rather than with a bare `+`:
     the reading sheet returns each nozzle's figures and no day total, and a
     column of two-decimal sums drifts in binary floating point. */
  const totals = {
    litres: done.reduce((sum, row) => sum + Number(row.litres_sold ?? 0), 0),
    cash: sumMoney(done.map((row) => row.cash_amount)),
    credit: sumMoney(done.map((row) => row.credit_amount)),
  };

  const missingRate = sheet.some((row) => !row.rate);

  /*
   * A RATE CARRIED OVER FROM AN EARLIER DAY, while there is still something to
   * enter at it. This pump's prices move most days, and the owner sets the new
   * one when he gets to it - four times now (14 Aug, 25 Aug, 12 Sep, 26-27
   * Sep) the day's readings went in first, on the previous day's rate, and the
   * new price was set straight afterwards. Migration 066 makes a price set
   * afterwards re-price those readings, so the books come right either way;
   * this says so BEFORE saving, which is where the mistake is cheapest.
   *
   * Only for a fuel with a nozzle still to enter: once the day is in, a
   * carried-over rate is either right or already re-priced, and a notice that
   * stays up after the work is done is one nobody reads.
   */
  const carriedOver = [...new Set(sheet.filter((row) => !row.reading_id).map((row) => row.fuel_type))]
    .map((fuelType) => ({ fuelType, price: ratesInForce[fuelType] }))
    .filter(({ price }) => price && price.effective_from < date);

  /*
   * A GAP BEFORE THIS DAY. get_reading_sheet gives every row the nearest
   * EARLIER reading for that nozzle (`previous_date`) - not necessarily
   * yesterday. When it isn't yesterday, whole days in between were never
   * opened, which is exactly the mistake this page is for: coming back after a
   * break and typing the day's numbers against today without noticing the day
   * before was left empty.
   *
   * A warning, not a block - migration 027 allows a day that leaves a genuine
   * gap behind it, because filling the gap later looks the same on the wire as
   * the mistake. This banner and the checkbox in the entry dialog are what make
   * the difference visible before saving.
   */
  const expectedPreviousDate = shiftISODate(date, -1);
  const gapRows = sheet.filter(
    (row) => row.previous_date && row.previous_date !== expectedPreviousDate,
  );
  const dayGap =
    gapRows.length === 0
      ? null
      : (() => {
          const earliestPrevious = gapRows.reduce(
            (min, row) => (row.previous_date < min ? row.previous_date : min),
            gapRows[0].previous_date,
          );
          return {
            from: shiftISODate(earliestPrevious, 1),
            to: expectedPreviousDate,
            partial: gapRows.length < sheet.length,
          };
        })();

  /*
   * Grouped by unit, because a unit is a physical pump on the forecourt with
   * two nozzles bolted to it. get_reading_sheet returns rows ordered by unit
   * then nozzle, so this keeps that order. A unit number outlives the hardware
   * wearing it, so the group is unit number AND commissioned_on (migration 056).
   */
  const units = [];
  for (const row of sheet) {
    const last = units[units.length - 1];
    if (last && last.unitNumber === row.unit_number && last.commissionedOn === row.commissioned_on) {
      last.rows.push(row);
    } else {
      units.push({
        key: `${row.unit_number}|${row.commissioned_on ?? 'original'}`,
        unitNumber: row.unit_number,
        commissionedOn: row.commissioned_on,
        retiredOn: row.retired_on,
        rows: [row],
      });
    }
  }

  /*
   * THE ONE DAY A UNIT NUMBER MEANS TWO PUMPS. A damaged dispenser can sell in
   * the morning and its replacement in the afternoon, so on the changeover date
   * the sheet holds two Unit 1s. On that day, and only that day, each card says
   * which of the two it is - getting them the wrong way round would put the old
   * pump's last figures onto the new pump's meters.
   */
  const generationsPerUnit = units.reduce((count, unit) => {
    count.set(unit.unitNumber, (count.get(unit.unitNumber) ?? 0) + 1);
    return count;
  }, new Map());

  return (
    <>
      {/* The day, as the page's heading - the same header the Dashboard uses,
          with Clear this day on its control row (owner only: entering a day
          against the wrong date is the mistake it exists for, and it poisons
          every day after, because each opening comes from the day before). */}
      <DayHeader date={date} basePath="/admin/readings" title="Daily readings" icon="readings">
        {isOwner ? (
          <ClearDayButton date={date} dateLabel={formatDate(date)} entryCount={done.length} />
        ) : null}
      </DayHeader>

      {afterMidnight || dayGap || missingRate || carriedOver.length > 0 ? (
        <div className="mt-4 space-y-3">
          {/* Typed after closing, past midnight: the page opened on the day
              just traded, not on the new date (entryDayISO). */}
          {afterMidnight ? (
            <Notice tone="info" icon="date" title={`Opened on ${formatDateLong(date)}, the day just traded`}>
              It is after midnight, so these readings go on yesterday. If you are entering
              today&apos;s instead, press Back to today ({formatDate(today)}).
            </Notice>
          ) : null}
          {dayGap ? (
            <Notice tone="danger" icon="warning">
              <span className="font-semibold">
                {dayGap.from === dayGap.to
                  ? formatDateLong(dayGap.from)
                  : `${formatDateLong(dayGap.from)} to ${formatDateLong(dayGap.to)}`}
              </span>{' '}
              {dayGap.from === dayGap.to ? 'has' : 'have'} no reading saved
              {dayGap.partial ? ' for one or more nozzles' : ' at all'}. Check it wasn’t
              missed by mistake before entering {date === today ? 'today' : formatDate(date)}.
            </Notice>
          ) : null}

          {missingRate ? (
            <Notice tone="warn" icon="warning">
              No rate is set for one of the fuels on this date.{' '}
              {isOwner
                ? 'Set it under Settings before entering readings.'
                : 'Ask the owner to set the price before entering readings.'}
            </Notice>
          ) : null}

          {carriedOver.length > 0 ? (
            <Notice
              tone="warn"
              icon="warning"
              title={`Has the price changed since? ${
                isOwner
                  ? 'Set the new rate under Settings before entering.'
                  : 'Ask the owner to set the new rate before you enter.'
              }`}
            >
              {carriedOver.map(({ fuelType, price }) => (
                <p key={fuelType}>
                  {fuelColor(fuelType).label} is on{' '}
                  <span className="tabular whitespace-nowrap font-semibold">
                    {formatRate(price.rate)}
                  </span>
                  , the rate set for {formatDate(price.effective_from)}.
                </p>
              ))}
            </Notice>
          ) : null}
        </div>
      ) : null}

      {/* The id is what the cash-up bar watches: it shows itself only once
          these cards have left the viewport, so the day's totals are on
          screen exactly once at any moment. See ReadingsCashUpBar. No
          sparklines: these are the day's running totals while it is being
          typed, not a trend. */}
      <section
        id="day-totals"
        aria-label="Progress for the day"
        className="@container mt-5"
      >
        <div className="grid grid-cols-1 gap-4 @[34rem]:grid-cols-2 @[72rem]:grid-cols-4">
          <KpiCard
            label="Nozzles entered"
            icon="readings"
            tone="neutral"
            value={`${done.length} of ${sheet.length}`}
            sub={
              done.length === sheet.length && sheet.length > 0
                ? 'Every nozzle is in for this day'
                : `${sheet.length - done.length} still to enter`
            }
          />
          <KpiCard label="Litres sold" icon="fuelPump" tone="held" value={formatLitres(totals.litres)} />
          <KpiCard label="Cash" icon="cash" tone="money" value={formatPKR(totals.cash)} />
          <KpiCard label="Credit" icon="credit" tone="credit" value={formatPKR(totals.credit)} />
        </div>
      </section>

      {/* THE CARD IS THE UNIT - three pumps to work through, not six unrelated
          forms. Each nozzle opens a dialog to enter it, so the whole day stays
          visible and there is only ever one nozzle to type into. */}
      <div className="mt-10 space-y-8">
        {units.map((unit) => {
          const entered = unit.rows.filter((row) => row.reading_id).length;
          const allDone = entered === unit.rows.length;
          const percent = Math.round((entered / unit.rows.length) * 100);

          /*
           * THE HEADER WEARS THE UNIT'S FUEL in the colour the Stock page puts
           * on its tanks, at the owner's request, with `.fuel-band`'s wide soft
           * sheen over it. A unit selling two fuels falls back to neutral
           * rather than being labelled by whichever nozzle came first.
           */
          const fuels = new Set(unit.rows.map((row) => row.fuel_type));
          const unitColor = fuels.size === 1 ? fuelColor([...fuels][0]) : NEUTRAL_FUEL;
          const changeoverDay = (generationsPerUnit.get(unit.unitNumber) ?? 1) > 1;
          const outgoing = Boolean(unit.retiredOn);

          return (
            <section
              key={unit.key}
              data-card
              aria-label={
                changeoverDay
                  ? `Unit ${unit.unitNumber}, ${outgoing ? 'the unit being replaced' : 'the replacement unit'}`
                  : `Unit ${unit.unitNumber}`
              }
              className="panel overflow-hidden"
            >
              {/* Everything in the band takes its colour from the band -
                  currentColor for the icon, white-alpha for the chips and the
                  track - so the same classes serve petrol's dark band with white
                  text and diesel's light one with dark text. */}
              <div
                className={`fuel-band flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3.5 ${unitColor.solid}`}
              >
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/25 ring-1 ring-inset ring-black/10"
                  aria-hidden="true"
                >
                  <Icon name={allDone ? 'check' : 'readings'} className="h-[22px] w-[22px]" />
                </span>

                <div className="min-w-0">
                  <h2 className="text-lg font-bold leading-tight">Unit {unit.unitNumber}</h2>
                  {unitColor.label ? (
                    <p className="text-sm font-medium opacity-90">{unitColor.label}</p>
                  ) : null}
                </div>

                {/* Words, not colour: both cards are the same fuel on the one
                    day a unit number means two pumps. */}
                {changeoverDay ? (
                  <span className="badge bg-white/25 ring-1 ring-inset ring-black/10">
                    {outgoing ? 'being replaced today' : 'the new unit'}
                  </span>
                ) : null}

                <span className="badge ml-auto bg-white/25 ring-1 ring-inset ring-black/10">
                  {allDone ? <Icon name="check" className="h-4 w-4" /> : null}
                  {entered} of {unit.rows.length} entered
                </span>

                {/* Only while there is progress to show: a full bar on a
                    filled band has no track left to contrast with and reads as
                    a stray white rule. The chip above says the same thing. */}
                {allDone ? null : (
                  <div className="w-full @container">
                    <div
                      className="h-2 overflow-hidden rounded-full bg-white/40 ring-1 ring-inset ring-black/10"
                      role="img"
                      aria-label={`Unit ${unit.unitNumber} is ${percent} percent entered`}
                    >
                      <div
                        className="h-full rounded-full bg-brand-500 transition-all"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Two nozzle cards side by side, the way two nozzles hang off
                  one dispenser. `@container`, not `sm:` - this sits inside a
                  sidebar layout, so the window is not the width it has. */}
              <div className="@container bg-ink-50/60 p-4">
                <div className="grid grid-cols-1 items-stretch gap-4 @[34rem]:grid-cols-2">
                  {unit.rows.map((row) => (
                    <ReadingForm
                      key={row.nozzle_id}
                      row={row}
                      date={date}
                      customers={customers}
                      creditSales={creditSalesByReading[row.reading_id] ?? []}
                      canDelete={isOwner}
                      showUnit={false}
                    />
                  ))}
                </div>
              </div>
            </section>
          );
        })}
      </div>

      {/* Clears the last unit from under the cash-up bar - sized from the
          PHONE, where the bar wraps to two lines, not from the laptop. */}
      <div aria-hidden="true" className="h-28" />

      <ReadingsCashUpBar
        watchId="day-totals"
        entered={done.length}
        total={sheet.length}
        litres={formatLitres(totals.litres)}
        cash={formatPKR(totals.cash)}
        credit={formatPKR(totals.credit)}
      />
    </>
  );
}
