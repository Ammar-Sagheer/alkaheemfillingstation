import PendingLink from '@/app/_components/ui/PendingLink';
import FuelBadge from '@/app/_components/ui/FuelBadge';
import Pager from '@/app/_components/ui/Pager';
import StockCheckForm from '@/app/_components/admin/StockCheckForm';
import DayHeader from '@/app/_components/admin/dashboard/DayHeader';
import SectionHeader from '@/app/_components/admin/dashboard/SectionHeader';
import Notice from '@/app/_components/admin/dashboard/Notice';

import { formatDate, formatDateLong, shiftISODate } from '@/app/_lib/date-helpers';
import { formatLitres, formatLitresFine } from '@/app/_lib/format-helpers';

const PER_PAGE = 25;

/*
 * `.table-scroll` bleeds to the screen edges on a phone (-mx-4 px-4) - right
 * for a card that IS the scroller, wrong inside a `.panel` that clips: the
 * bleed is cut off and the render check reports the table escaping its card.
 * `mx-0 px-0` at the call site, so the panel is the edge and the table scrolls
 * inside it. Its height cap stays: it is what keeps the column headings pinned
 * while reading down 25 dips (the first cut of this page switched it off with
 * `max-h-none`, which lost them).
 */

/**
 * The Stock page, drawn - in the new look the Dashboard set.
 *
 * Three zones, as before: the two tanks' dips, the lubricant shelf, and the
 * dips already taken. What each one says is unchanged; how it looks moved over.
 */
export default function StockView({
  date,
  page,
  tanks,
  checks,
  lubricants,
  canManage,
  afterMidnight = false,
}) {
  const checksOnDate = new Map(
    checks.filter((check) => check.check_date === date).map((check) => [check.tank_id, check]),
  );

  /*
   * The earliest day each tank has a dip closing. A dip with nothing before it
   * is measured against the tank's OPENING STOCK from Settings, not against an
   * earlier measurement, so a difference there is two typed figures
   * disagreeing, not fuel that moved - and must not be called a gain. Derived
   * here because getStockChecks() is uncapped: the first dip is the one with
   * the smallest books_date.
   */
  const earliestByTank = new Map();
  for (const check of checks) {
    const closes = check.books_date ?? check.check_date;
    const seen = earliestByTank.get(check.tank_id);
    if (!seen || closes < seen) earliestByTank.set(check.tank_id, closes);
  }

  /*
   * Sliced rather than paged in Postgres: the lookup above needs whichever
   * check belongs to the DATE ON SCREEN, and that row is not necessarily on the
   * page of history being shown. Paging in the database would make a card offer
   * to re-record a dip that had already been taken.
   */
  const pageChecks = checks.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  return (
    <>
      <DayHeader date={date} basePath="/admin/stock-checks" title="Stock" icon="stock" />

      {/* A dip taken after closing and typed past midnight belongs to the day
          just traded: the page opened there (entryDayISO). */}
      {afterMidnight ? (
        <Notice tone="info" icon="date" title={`Opened on ${formatDateLong(date)}, the day just traded`} className="mt-4">
          It is after midnight, so a dip taken after closing goes on yesterday evening. For a
          dip taken this morning, press Back to today ({formatDate(shiftISODate(date, 1))}).
        </Notice>
      ) : null}

      {/* ================= the tanks ================= */}
      <section aria-labelledby="tanks-heading" className="@container mt-10">
        <SectionHeader
          id="tanks-heading"
          icon="stock"
          tone="held"
          title="Tanks: dip against the books"
          description="A morning dip measures what was left at the close of the day before, so that is the day it is checked against."
        />
        {/* ONE HEIGHT FOR THE PAIR. This was `items-start`: a tank with its
            dip recorded is shorter than one still showing the form, and the
            stretched one had blank card under it. Two tanks of different
            heights side by side read as broken too (reported 27 Sep 2026),
            so the pair stretches, and StockCheckForm puts the space above the
            dip, so the dip sits at the foot of its card. */}
        <div className="grid gap-5 @[50rem]:grid-cols-2">
          {tanks.map((tank) => (
            <StockCheckForm
              key={tank.id}
              tank={tank}
              date={date}
              existingCheck={checksOnDate.get(tank.id) ?? null}
              earliestBooksDate={earliestByTank.get(tank.id) ?? null}
              openingStock={tank.opening_stock_litres}
              canManage={canManage}
            />
          ))}
        </div>
      </section>

      {/* ================= the lubricant shelf ================= */}
      <section aria-labelledby="shelf-heading" className="@container mt-12">
        <SectionHeader
          id="shelf-heading"
          icon="lubricants"
          tone="oil"
          title="Lubricant shelf"
          description={`Book stock up to ${formatDate(date)}: opening, plus everything bought, less everything sold. There is no dip stick for a shelf of tins.`}
        />

        {lubricants.length === 0 ? (
          <div data-card className="panel px-5 py-6 text-center text-base text-ink-700">
            No lubricants set up yet.{' '}
            <PendingLink
              href="/admin/lubricants"
              className="font-semibold text-brand-700 underline-offset-2 hover:underline"
            >
              Add the brands the pump stocks
            </PendingLink>{' '}
            and their stock will be listed here beside the tanks.
          </div>
        ) : (
          <>
            <div data-card className="panel overflow-hidden">
              <div className="table-scroll mx-0 px-0">
                <table className="w-full min-w-[40rem]">
                  <thead className="border-b border-ink-200 bg-ink-50">
                    <tr>
                      <th className="th pl-5">Lubricant</th>
                      <th className="th text-right">Opening</th>
                      <th className="th text-right">Bought</th>
                      <th className="th text-right">Sold</th>
                      <th className="th pr-5 text-right">In stock</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {lubricants.map((row) => (
                      <ShelfRow key={row.id} row={row} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="mt-3 text-base text-ink-700">
              Sales are recorded under{' '}
              <PendingLink
                href="/admin/lubricants"
                className="font-semibold text-brand-700 underline-offset-2 hover:underline"
              >
                Lubricants
              </PendingLink>
              , deliveries under{' '}
              <PendingLink
                href="/admin/purchases"
                className="font-semibold text-brand-700 underline-offset-2 hover:underline"
              >
                Purchases
              </PendingLink>
              .
            </p>
          </>
        )}
      </section>

      {/* ================= dips already taken ================= */}
      <section aria-labelledby="history-heading" className="@container mt-12">
        <SectionHeader
          id="history-heading"
          icon="activity"
          tone="neutral"
          title="Previous dips"
          description="Newest first. Each is dated by the trading day it closes, with when the rod went in, and any note, underneath."
        />

        {checks.length === 0 ? (
          <div data-card className="panel px-5 py-6 text-center text-base text-ink-700">
            No dips recorded yet. The first one becomes the baseline every later stock figure is
            measured from.
          </div>
        ) : (
          <>
            <div data-card className="panel overflow-hidden">
              <div className="table-scroll mx-0 px-0">
                <table className="w-full min-w-[44rem]">
                  <thead className="border-b border-ink-200 bg-ink-50">
                    <tr>
                      {/* The day the dip CLOSES leads: that is the day its gain
                          or loss belongs to, and the one it lines up with on
                          Readings. When the rod went in is the second line. */}
                      <th className="th pl-5">Day checked</th>
                      <th className="th">Tank</th>
                      <th className="th text-right">Expected</th>
                      <th className="th text-right">Measured</th>
                      <th className="th pr-5 text-right">Gain / loss</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {pageChecks.map((check) => {
                      const difference = Number(check.gain_loss);
                      // A tank's first dip has no earlier measurement behind
                      // it, so its "gain" is a disagreement with the opening
                      // stock in Settings. Named, and not coloured as a surplus.
                      const firstDip =
                        (check.books_date ?? check.check_date) ===
                        earliestByTank.get(check.tank_id);
                      return (
                        <tr key={check.id}>
                          <td className="td whitespace-nowrap pl-5">
                            <span className="font-semibold text-ink-900">
                              {formatDate(check.books_date ?? check.check_date)}
                            </span>
                            <span className="block text-sm text-ink-600">
                              dipped {check.taken ?? 'morning'} of {formatDate(check.check_date)}
                            </span>
                            {/* THE NOTE IS A LINE UNDER THE DAY, not a column
                                of its own - the way Banking and Lubricants
                                carry theirs. As a sixth column it was what was
                                left after five nowrap ones: 112px, a note one
                                word to a line and its row four times the
                                height of the rest, and a table too wide for a
                                tablet held upright. Here it wraps to the
                                width the date lines set, and is read without
                                scrolling on a phone. */}
                            {check.note ? (
                              <span className="mt-1 block max-w-[48ch] whitespace-normal text-sm text-ink-700 [overflow-wrap:anywhere]">
                                <span className="font-semibold text-ink-800">Note:</span>{' '}
                                {check.note}
                              </span>
                            ) : null}
                          </td>
                          <td className="td">
                            <FuelBadge fuelType={check.tank?.fuel_type} />
                          </td>
                          <td className="td-num">{formatLitres(check.expected_stock)}</td>
                          <td className="td-num font-semibold text-ink-900">
                            {formatLitres(check.actual_dip_reading)}
                          </td>
                          <td
                            className={[
                              'td-num pr-5 font-bold',
                              difference === 0
                                ? 'text-ink-700'
                                : firstDip
                                  ? 'text-amber-900'
                                  : difference > 0
                                    ? 'text-brand-700'
                                    : 'text-red-700',
                            ].join(' ')}
                          >
                            {/* The sign is written out, so a gain and a loss
                                differ in shape as well as colour. */}
                            {difference > 0 && !firstDip ? '+' : ''}
                            {firstDip
                              ? formatLitres(Math.abs(difference))
                              : formatLitres(difference)}
                            {firstDip ? (
                              <span className="block text-sm font-normal text-ink-600">
                                vs opening stock
                              </span>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <Pager
              page={page}
              perPage={PER_PAGE}
              total={checks.length}
              hrefFor={(n) => `/admin/stock-checks?date=${date}&page=${n}`}
              label="Stock check pages"
            />
          </>
        )}
      </section>
    </>
  );
}

/**
 * One product on the shelf.
 *
 * LOW AND OUT OF STOCK IN WORDS, not only in colour. This column used to say
 * "run out" by printing the figure red and "running low" by printing it amber,
 * and nothing else - the same shape as a healthy figure to a red-green
 * colourblind reader in a dim office. It now carries the same badge the
 * Lubricants page does, on the same rule: below one pack there is nothing left
 * to sell as a pack; for the drum, ten litres is roughly a week.
 *
 * The drum is not a pack. This row used to print "0 L pack" beside it, a
 * figure that described nothing; it says "loose, from the drum" instead, and
 * its litres carry the drum's third decimal.
 */
function ShelfRow({ row }) {
  const left = Number(row.stock_litres ?? 0);
  const pack = Number(row.pack_size_litres ?? 0);
  const lowAt = row.sold_loose ? 10 : pack;
  const state = left <= 0 ? 'out' : left < lowAt ? 'low' : 'ok';
  const show = row.sold_loose ? formatLitresFine : formatLitres;

  return (
    <tr>
      <td className="td pl-5">
        <span className="font-semibold text-ink-900">{row.name}</span>
        <span className="block text-sm text-ink-600">
          {row.sold_loose ? 'loose, from the drum' : `${formatLitres(pack)} pack`}
          {row.is_active ? null : ' · retired'}
        </span>
      </td>
      <td className="td-num text-ink-600">{show(row.opening_stock_litres)}</td>
      <td className="td-num">{show(row.purchased_litres)}</td>
      <td className="td-num">{show(row.sold_litres)}</td>
      <td className="td-num pr-5">
        <span className="inline-flex items-center justify-end gap-2">
          {state === 'ok' ? null : (
            <span
              className={`badge text-xs ${
                state === 'out' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-900'
              }`}
            >
              {state === 'out' ? 'Out of stock' : 'Low'}
            </span>
          )}
          <span
            className={`font-bold ${
              state === 'out' ? 'text-red-700' : state === 'low' ? 'text-amber-900' : 'text-ink-900'
            }`}
          >
            {show(left)}
          </span>
        </span>
      </td>
    </tr>
  );
}
