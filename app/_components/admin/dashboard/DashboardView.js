import Icon from '@/app/_components/ui/Icon';
import DayHeader from '@/app/_components/admin/dashboard/DayHeader';
import KpiCard from '@/app/_components/admin/dashboard/KpiCard';
import SectionHeader from '@/app/_components/admin/dashboard/SectionHeader';
import FuelCard from '@/app/_components/admin/dashboard/FuelCard';
import LubricantPanels from '@/app/_components/admin/dashboard/LubricantPanels';
import MonthEndStock from '@/app/_components/admin/dashboard/MonthEndStock';
import Notice from '@/app/_components/admin/dashboard/Notice';
import TrendWindow from '@/app/_components/admin/dashboard/TrendWindow';
import { TILE } from '@/app/_components/admin/dashboard/tones';
import {
  FuelSalesChart,
  CashAgainstCreditChart,
  OilSalesChart,
} from '@/app/_components/admin/dashboard/TrendCharts';

import { shiftISODate, formatDate, formatMonth } from '@/app/_lib/date-helpers';
import { formatLitres, formatPKR, sumMoney } from '@/app/_lib/format-helpers';
import { FUEL_ORDER, byFuelOrder } from '@/app/_lib/fuel-colors';

/**
 * The Dashboard, drawn. Everything below the data fetch.
 *
 * `app/admin/page.js` checks the role and asks the database; this takes what
 * came back and lays it out. Split that way so the real page can be rendered
 * with fixture data for a screenshot - a devcheck route imports THIS, rather
 * than a copy of its markup that would drift from it (see CLAUDE.md,
 * "Verifying UI changes").
 *
 * Nothing here computes a money figure the database also computes. The tiles
 * show the RPC's own totals; the one thing added up here is fuel and oil for
 * the same day - two figures the database returns separately and never as one
 * - and that is done in paisa by `sumMoney`, exactly, not with a bare `+`.
 *
 * The layout, top to bottom, in the order a morning check runs:
 *   1. which day this is                                    DayHeader
 *   2. what was taken - total, cash, credit - and litres    KpiCard x4
 *   3. each fuel: sold, left in its tank, the month so far  FuelCard x2
 *   4. oil: the counter and the shelf                       LubricantPanels
 *   5. last month's closing stock = this month's opening    MonthEndStock
 *   6. the trend behind all of it                           TrendCharts
 */
export default function DashboardView({
  date,
  trendDays,
  trendFrom,
  summary,
  trend,
  lubricantTrend,
  monthEndStock = null,
}) {
  const totals = summary.totals ?? {};
  const byFuel = summary.by_fuel_type ?? [];
  const tanks = summary.tanks ?? [];
  const purchases = summary.purchases ?? {};
  const lubricants = summary.lubricants ?? {};
  const lubricantsSold = summary.lubricants_by_product ?? [];
  const lubricantStock = summary.lubricant_stock ?? [];

  /*
   * THE HEADLINE FIGURES are the whole day's takings, fuel and oil together -
   * that is what was in the drawer at closing time. The cards below are where
   * each trade is broken out.
   */
  const fuelAmount = Number(totals.sale_amount ?? 0);
  const lubricantAmount = Number(lubricants.amount ?? 0);
  const saleAmount = sumMoney([fuelAmount, lubricantAmount]);
  const cashAmount = sumMoney([totals.cash_amount, lubricants.cash_amount]);
  const creditAmount = sumMoney([totals.credit_amount, lubricants.credit_amount]);
  const creditShare = saleAmount > 0 ? Math.round((creditAmount / saleAmount) * 100) : 0;
  const litresSold = Number(totals.litres_sold ?? 0);

  /*
   * THE SAME FOUR FIGURES FOR EVERY DAY IN THE WINDOW, for the sparklines and
   * the comparison with yesterday.
   *
   * Built the way the headline figures are built - fuel plus oil - so each
   * card's line, its hover readout and its percent badge all describe the
   * figure printed on the card. The old tiles drew FUEL-ONLY lines under
   * fuel-and-oil figures, so hovering today on "Total sales" showed a
   * different number from the one on the card, by the day's oil takings; the
   * badges had already been made exact (migration 043), the lines had not.
   *
   * `trend` is fuel and `lubricantTrend` is oil, both on the same date spine
   * (generate_series from `trendFrom` to `date`), matched here by day rather
   * than by position so a gap in either could not pair two different days.
   */
  const oilByDay = new Map(lubricantTrend.map((row) => [row.day, row]));
  const days = trend.map((row) => {
    const oil = oilByDay.get(row.day);
    return {
      day: row.day,
      litres: Number(row.litres_sold ?? 0),
      sales: sumMoney([row.sale_amount, oil?.pack_amount, oil?.loose_amount]),
      cash: sumMoney([row.cash_amount, oil?.cash_amount]),
      credit: sumMoney([row.credit_amount, oil?.credit_amount]),
    };
  });

  /*
   * YESTERDAY, FOR THE PERCENT BADGES. The window always reaches back at least
   * seven days, so the day before is in it; if it somehow is not, there is no
   * badge rather than a guessed one. A zero day before gets no badge either -
   * DeltaBadge's own rule, since "rose from nothing" is not a percentage.
   *
   * AND NO BADGE ON A DAY WHOSE READINGS ARE NOT IN YET. Every evening until
   * the readings are typed, today is Rs 0 against a full yesterday, and the old
   * tiles said so: four red "down 100%" pills over four cards that also said
   * "No readings entered for this day". That is the mirror of the zero-baseline
   * case - a comparison against a day that has not been entered is not a fall
   * in sales, it is a missing day - and the badge was the loudest thing on the
   * page asserting the wrong one. Fuel is nearly all of the takings, so no fuel
   * readings means no comparison on any of the four. A day with readings and
   * genuinely no credit still gets its (green) fall.
   */
  const entered = litresSold > 0;
  const yesterday = entered
    ? (days.find((row) => row.day === shiftISODate(date, -1)) ?? null)
    : null;
  const against = (current, key, higherIsBetter = true) =>
    yesterday ? { current, previous: yesterday[key], higherIsBetter } : null;

  /* `tips` are formatted HERE, on the server: Sparkline is a client component,
     a formatter cannot cross that boundary, and formatPKR / formatLitres are
     the app's one answer to how a figure is written. */
  const sparkOf = (key, format) => ({
    spark: days.map((row) => row[key]),
    sparkTips: days.map((row) => ({ v: format(row[key]), d: formatDate(row.day) })),
  });

  /*
   * ONE CARD PER FUEL, and always both fuels. The month-to-date figure is true
   * on a day with nothing entered, and a tank has a level whether or not it
   * sold anything, so neither card may drop out - see FuelCard. The fuels come
   * from FUEL_ORDER (diesel first, matching the forecourt) plus anything the
   * database returns that is not in it, so an unexpected tank still shows.
   */
  const [year, month] = date.split('-').map(Number);
  const monthFrom = `${date.slice(0, 7)}-01`;
  /* The calendar month `date` falls in, the 1st through `date` itself - not
     through today when an earlier day is on screen (migration 055). Read
     through a Map with a 0 fallback because `month_by_fuel_type` leaves a fuel
     out entirely if it has not sold a litre this month, and a slow fuel should
     say "0 L", not lose its line. */
  const monthByFuel = new Map(
    (summary.month_by_fuel_type ?? []).map((row) => [row.fuel_type, Number(row.litres_sold ?? 0)]),
  );
  const fuelTypes = [
    ...new Set([
      ...FUEL_ORDER.filter((fuelType) => fuelType !== 'lubricant'),
      ...tanks.map((tank) => tank.fuel_type),
      ...byFuel.map((row) => row.fuel_type),
    ]),
  ]
    .map((fuelType) => ({ fuel_type: fuelType }))
    .sort(byFuelOrder)
    .map((row) => row.fuel_type);

  const deliveredLitres = Number(purchases.quantity_litres ?? 0);

  return (
    <div className="pb-6">
      <DayHeader date={date} basePath="/admin" extraParams={{ days: trendDays }} />

      {/* ================= the takings ================= */}
      <section aria-labelledby="takings-heading" className="@container mt-5">
        <h2 id="takings-heading" className="sr-only">
          Takings on {formatDate(date)}
        </h2>

        {/* Four across only from 72rem of GRID - about 1152px, which the
            1600x900 laptop has and a 1024-1152px window does not. At 62rem
            the cards were 236px at 1024 and their labels wrapped beside the
            percent pill. Two across below that; one on a phone. Measured
            against the grid, not the window: the sidebar makes those two
            different numbers. */}
        <div className="grid grid-cols-1 gap-4 @[34rem]:grid-cols-2 @[72rem]:grid-cols-4">
          <KpiCard
            label="Total sales"
            icon="sales"
            tone="money"
            value={formatPKR(saleAmount)}
            delta={against(saleAmount, 'sales')}
            {...sparkOf('sales', formatPKR)}
            /* A card with nothing to add says so, rather than sitting at
               "Rs 0" over an inch of white like a page that failed to load.
               Each figure is its own nowrap span, with the spaces written
               out: prose wraps, a money figure inside it never does. */
            sub={
              lubricantAmount > 0 ? (
                <>
                  <span className="whitespace-nowrap">{formatPKR(fuelAmount)} fuel</span>
                  {' · '}
                  <span className="whitespace-nowrap">{formatPKR(lubricantAmount)} lubricants</span>
                </>
              ) : saleAmount > 0 ? (
                'Fuel only, no oil sold'
              ) : (
                'Nothing sold on this day'
              )
            }
          />
          <KpiCard
            label="Cash"
            icon="cash"
            tone="money"
            value={formatPKR(cashAmount)}
            delta={against(cashAmount, 'cash')}
            {...sparkOf('cash', formatPKR)}
            sub={saleAmount > 0 ? `${100 - creditShare}% of takings` : 'Nothing taken in cash'}
          />
          <KpiCard
            label="On credit"
            icon="credit"
            tone="credit"
            value={formatPKR(creditAmount)}
            delta={against(creditAmount, 'credit', false)}
            {...sparkOf('credit', formatPKR)}
            sub={saleAmount > 0 ? `${creditShare}% of takings` : 'Nothing sold on credit'}
            /* More than half the day on the book is worth a look - the same
               line the old tile drew, now said in words as well as red. */
            alert={creditShare > 50 ? `${creditShare}% of takings, over half` : null}
          />
          <KpiCard
            label="Fuel sold"
            icon="fuelPump"
            tone="held"
            value={formatLitres(litresSold)}
            delta={against(litresSold, 'litres')}
            {...sparkOf('litres', formatLitres)}
            sub={
              Number(lubricants.litres ?? 0) > 0 ? (
                <>
                  {'plus '}
                  <span className="whitespace-nowrap">{formatLitres(lubricants.litres)}</span>
                  {' of lubricants'}
                </>
              ) : litresSold > 0 ? (
                'No lubricants sold'
              ) : (
                'No readings entered for this day'
              )
            }
          />
        </div>
      </section>

      {/* ================= fuel ================= */}
      <section aria-labelledby="fuel-heading" className="@container mt-12">
        <SectionHeader
          id="fuel-heading"
          icon="fuelPump"
          tone="held"
          title="Fuel"
          description="Sold on the day, left in the tank at the close, and the month so far."
        />

        {/* ONE HEIGHT FOR THE PAIR. This was `items-start`, on the reasoning
            that stretching the shorter card (a fuel with nothing entered yet)
            left blank card that read as a figure that had not loaded. The
            uneven pair read as the broken thing instead (reported 27 Sep
            2026). So the cards stretch, and FuelCard gives the spare height
            to its "sold" part: the blank sits under "No diesel readings
            entered for this day", which explains it, and the tank and the
            month still line up across the row. */}
        <div className="grid gap-4 @[50rem]:grid-cols-2">
          {fuelTypes.map((fuelType) => (
            <FuelCard
              key={fuelType}
              fuelType={fuelType}
              date={date}
              sold={byFuel.find((row) => row.fuel_type === fuelType) ?? null}
              tanks={tanks.filter((tank) => tank.fuel_type === fuelType)}
              month={{
                label: formatMonth(year, month),
                from: monthFrom,
                litres: monthByFuel.get(fuelType) ?? 0,
              }}
            />
          ))}
        </div>

        {deliveredLitres > 0 ? (
          <div data-card className="panel mt-4 flex items-center gap-3.5 px-5 py-3.5">
            <span className={`icon-tile h-10 w-10 ${TILE.neutral}`}>
              <Icon name="purchases" className="h-[22px] w-[22px]" />
            </span>
            <p className="text-base text-ink-700">
              <span className="tabular whitespace-nowrap font-semibold text-ink-900">
                {formatLitres(deliveredLitres)}
              </span>{' '}
              of fuel delivered on {formatDate(date)}, costing{' '}
              <span className="tabular whitespace-nowrap font-semibold text-ink-900">
                {formatPKR(purchases.total_cost)}
              </span>
              .
            </p>
          </div>
        ) : null}
      </section>

      {/* ================= lubricants ================= */}
      <section aria-labelledby="lubricants-heading" className="@container mt-12">
        <SectionHeader
          id="lubricants-heading"
          icon="lubricants"
          tone="oil"
          title="Lubricants"
          description="Oil sold over the counter on the day, and what is left on the shelf."
        />
        <LubricantPanels
          date={date}
          lubricants={lubricants}
          sold={lubricantsSold}
          stock={lubricantStock}
        />
      </section>

      {/* ================= month-end stock =================
          The month before the one shown: its closing stock, which is also this
          month's opening stock, per fuel with the rate it is valued at. Asked
          for so the owner's father could tick the app's profit against the
          accountant's sheet (migration 068). */}
      {monthEndStock ? (
        <section aria-labelledby="month-end-heading" className="@container mt-12">
          <SectionHeader
            id="month-end-heading"
            icon="stock"
            tone="held"
            title={`Stock carried into ${formatMonth(year, month).split(' ')[0]}`}
            description={
              monthEndStock.error
                ? null
                : `What the tanks held at the close of ${formatDate(monthEndStock.to)}: ${formatMonth(
                    Number(monthEndStock.to.slice(0, 4)),
                    Number(monthEndStock.to.slice(5, 7)),
                  )}'s closing stock and ${formatMonth(year, month)}'s opening stock.`
            }
          />
          {monthEndStock.error ? (
            <Notice tone="warn" title="The month-end stock did not load">
              {monthEndStock.error}
            </Notice>
          ) : (
            <MonthEndStock stock={monthEndStock} side="closing" />
          )}
        </section>
      ) : null}

      {/* ================= trends =================
          The charts END on the day shown above, not on today - so the span is
          written out under the heading, because "Last 14 days" alone is wrong
          the moment the reader has stepped back a week. */}
      <section aria-labelledby="trends-heading" className="@container mt-12">
        <SectionHeader
          id="trends-heading"
          icon="reports"
          tone="neutral"
          title={`Last ${trendDays} days`}
          description={`${formatDate(trendFrom)} to ${formatDate(date)}, ending on the day shown above.`}
        >
          <TrendWindow days={trendDays} hrefFor={(window) => `/admin?date=${date}&days=${window}`} />
        </SectionHeader>

        <div className="grid gap-4 @[56rem]:grid-cols-2">
          <section data-card className="panel min-w-0 p-5">
            <FuelSalesChart data={trend} />
          </section>
          <section data-card className="panel min-w-0 p-5">
            <CashAgainstCreditChart data={trend} />
          </section>
          {/* The full width of the row: two series stack into one bar per day,
              and squeezed to half the page the quiet days become slivers -
              which is exactly where the drum's takings live. */}
          <section data-card className="panel min-w-0 p-5 @[56rem]:col-span-2">
            <OilSalesChart data={lubricantTrend} />
          </section>
        </div>
      </section>
    </div>
  );
}
