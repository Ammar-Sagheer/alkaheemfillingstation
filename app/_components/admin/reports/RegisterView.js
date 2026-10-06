import EmptyState from '@/app/_components/ui/EmptyState';
import Icon from '@/app/_components/ui/Icon';
import Sparkline from '@/app/_components/ui/Sparkline';
import RegisterRange from '@/app/_components/admin/RegisterRange';
import RegisterTable from '@/app/_components/admin/RegisterTable';
import TitleHeader from '@/app/_components/admin/dashboard/TitleHeader';
import SectionHeader from '@/app/_components/admin/dashboard/SectionHeader';
import KpiCard, { KpiGrid } from '@/app/_components/admin/dashboard/KpiCard';
import Notice from '@/app/_components/admin/dashboard/Notice';

import { fuelColor, byFuelOrder } from '@/app/_lib/fuel-colors';
import { formatDate } from '@/app/_lib/date-helpers';
import { formatLitres, formatNumber, formatPKR, sumMoney } from '@/app/_lib/format-helpers';

/**
 * The Daily Sale & Stock Register, drawn - in the new look
 * (docs/UI_CONVENTIONS.md -> "The new look").
 *
 * The owner keeps this as a spreadsheet - one row per trading day per tank,
 * with the running sales and the running gain/loss beside each other - and the
 * two cumulative columns are the whole point of it. A single day's variance is
 * a person squinting at a wet dipstick; 30 L either way on a 5,000 L tank is
 * the measurement, not the fuel. A leak or a theft shows up as a cumulative
 * variance that walks in one direction and a percentage that will not come
 * back towards zero, and neither the Stock page (one day) nor Reports (one
 * whole month, one total) can show that.
 *
 * Takes the page's query results as they come back, so a devcheck route can
 * hand it fixtures; everything derived from them is worked out here.
 *
 * It was drawn in Material UI (`Paper`, `Chip`, `TextField`) at the owner's
 * request while it was a preview, and its money tiles duplicated `StatTile`
 * on a `Paper`, with a note saying one of the two should go if the page
 * graduated. The new look is that decision: the money cards are `KpiCard`,
 * the fuel cards are the Dashboard's shape, and the MUI copies are gone.
 */
export default function RegisterView({
  range,
  previous,
  rows,
  summary,
  previousSummary,
  salesTrend,
  purchaseDays,
  expenseDays,
}) {
  // Grouped by tank, in the order the app shows fuels everywhere else (diesel
  // first - see FUEL_ORDER). The RPC already returns each tank's rows in date
  // order, which the cumulative columns depend on, so nothing is re-sorted
  // inside a group.
  const tanks = [];
  for (const row of rows) {
    let tank = tanks.find((candidate) => candidate.tank_id === row.tank_id);
    if (!tank) {
      tank = {
        tank_id: row.tank_id,
        name: row.tank_name,
        fuel_type: row.fuel_type,
        rows: [],
      };
      tanks.push(tank);
    }
    tank.rows.push(row);
  }
  tanks.sort(byFuelOrder);

  const traded = tanks.some((tank) =>
    tank.rows.some((row) => Number(row.meter_sales) > 0 || Number(row.receipts) > 0),
  );

  const profit = Number(summary.profit ?? 0);
  const costOfStockSold = Number(summary.cost_of_goods_sold ?? 0);
  const totalSales = Number(summary.total_sales ?? 0);
  const totalStockCost = Number(summary.total_stock_cost ?? 0);
  const expenses = Number(summary.expenses_total ?? 0);

  /*
   * ONE POINT PER DAY IN THE RANGE, INCLUDING THE EMPTY ONES. `salesTrend` fills
   * every day; deliveries and expenses do not happen daily, so their maps have
   * holes. Drawing straight from the map would give a four-point line labelled
   * as a month and quietly join the 3rd to the 19th as if nothing sat between
   * them. Days with nothing are zero, which is what actually happened.
   */
  const dayKeys = salesTrend.map((row) => row.day);
  // Both trades, because the headline Sales figure counts both - and because
  // the daily split below has to add up to the headline profit exactly.
  const seriesSales = salesTrend.map((row) =>
    sumMoney([row.sale_amount, row.lubricant_amount]),
  );
  const seriesStock = dayKeys.map((day) => Number(purchaseDays[day] ?? 0));
  const seriesExpenses = dayKeys.map((day) => Number(expenseDays[day] ?? 0));

  /*
   * THE DAILY PROFIT LINE SPREADS THE COST OF STOCK SOLD ACROSS THE DAYS BY
   * LITRES, and it used to subtract stock BOUGHT on the day instead.
   *
   * That was the same bug the headline had (migration 049), and left alone it
   * would now be worse than before: the card says one thing and the shape
   * under it says another. A delivery day would still plunge to a deep loss on
   * a line sitting beneath a profit figure that no longer counts deliveries at
   * all.
   *
   * Litres is the right key to spread on: the cost of a litre is roughly
   * constant across a short run of days, so a day that sold twice as much fuel
   * consumed twice as much stock. And the split is EXACT at the total - every
   * day's litres add up to the period's litres, so every day's cost adds up to
   * the period's cost of goods sold, and the daily profits add up to the
   * profit on the card. Within the period it is an apportionment, not a
   * measurement, which is the right standing for a sparkline: a shape, not a
   * figure to read.
   */
  const seriesLitres = salesTrend.map((row) => Number(row.litres_sold ?? 0));
  const litresInPeriod = seriesLitres.reduce((sum, litres) => sum + litres, 0);
  const costPerLitre = litresInPeriod > 0 ? costOfStockSold / litresInPeriod : 0;
  const seriesProfit = dayKeys.map(
    (_, i) => seriesSales[i] - seriesLitres[i] * costPerLitre - seriesExpenses[i],
  );

  const tips = (series) =>
    dayKeys.map((day, i) => ({ v: formatPKR(series[i]), d: formatDate(day) }));

  const spanWords = `${range.days} ${range.days === 1 ? 'day' : 'days'}`;

  return (
    <>
      <TitleHeader
        title="Sale & stock register"
        icon="stock"
        tone="held"
        back={{ href: `/admin/reports?month=${range.month}`, label: 'Back to reports' }}
        description="Petrol and diesel day by day, with the running sales and the running gain or loss."
      >
        <RegisterRange month={range.month} fromDay={range.fromDay} toDay={range.toDay} />
      </TitleHeader>

      {/* ================= what each fuel did ================= */}
      {/* The range in words, once and loudly, as the heading everything under
          it answers to: a page whose every figure depends on a chosen span
          must state that span where the eye lands first. */}
      <section aria-labelledby="range-heading" className="@container mt-10">
        <SectionHeader
          id="range-heading"
          icon="date"
          tone="held"
          title={`${formatDate(range.from)} to ${formatDate(range.to)}`}
          description={`${spanWords}: what each fuel sold, and what the dips found against the books.`}
        />

        {!traded ? (
          <EmptyState
            icon="stock"
            title="Nothing was traded in this range"
            description="No readings and no deliveries fall on these days. Try another month, or a wider run of days."
          />
        ) : (
          <div className="grid grid-cols-1 gap-5 @[44rem]:grid-cols-2">
            {tanks.map((tank) => (
              <FuelCard key={tank.tank_id} fuelType={tank.fuel_type} rows={tank.rows} range={range} />
            ))}
          </div>
        )}
      </section>

      {traded ? (
        <>
          {/* ================= profit over the same days ================= */}
          <section aria-labelledby="profit-heading" className="@container mt-12">
            <SectionHeader
              id="profit-heading"
              icon="profit"
              tone="money"
              title="Profit over these days"
              description={`Each change is against the ${spanWords} before: ${formatDate(previous.from)} to ${formatDate(previous.to)}.`}
            />

            {/* `higherIsBetter` is FALSE on stock bought and expenses. An up
                arrow on either is still an up arrow, but the pill goes red:
                "expenses rose 40%" must never be painted the same green as
                "sales rose 40%". See DeltaBadge.js. */}
            <KpiGrid>
              <KpiCard
                label="Sales"
                icon="sales"
                tone="money"
                value={formatPKR(totalSales)}
                spark={seriesSales}
                sparkTips={tips(seriesSales)}
                delta={{ current: totalSales, previous: Number(previousSummary.total_sales ?? 0) }}
              />
              <KpiCard
                label="Stock bought"
                icon="purchases"
                tone="neutral"
                value={formatPKR(totalStockCost)}
                spark={seriesStock}
                sparkTips={tips(seriesStock)}
                delta={{
                  current: totalStockCost,
                  previous: Number(previousSummary.total_stock_cost ?? 0),
                  higherIsBetter: false,
                }}
              />
              <KpiCard
                label="Expenses"
                icon="expenses"
                tone="neutral"
                value={formatPKR(expenses)}
                spark={seriesExpenses}
                sparkTips={tips(seriesExpenses)}
                delta={{
                  current: expenses,
                  previous: Number(previousSummary.expenses_total ?? 0),
                  higherIsBetter: false,
                }}
              />
              <KpiCard
                label="Profit"
                icon="profit"
                tone="money"
                value={formatPKR(profit)}
                alert={profit < 0 ? 'A loss over these days' : null}
                spark={seriesProfit}
                sparkTips={tips(seriesProfit)}
                delta={{ current: profit, previous: Number(previousSummary.profit ?? 0) }}
              />
            </KpiGrid>

            {/* This used to warn that a single delivery could turn a good run
                of days into a loss here. It no longer can - profit counts the
                stock sold, so a delivery lands in closing stock rather than in
                the figure. What is worth saying instead is where the cost came
                from, because over a short run it is apportioned rather than
                measured. */}
            <Notice tone="info" title="How profit is worked out" className="mt-4">
              Profit counts the stock <span className="font-semibold">sold</span> over these days,
              so a delivery still in the tank is not charged against them. On the profit graph the
              cost is spread across the days by litres sold, so each day’s point is a share
              rather than a measurement; the total is exact.
            </Notice>
          </section>

          {/* ================= the register itself ================= */}
          <section aria-labelledby="register-heading" className="@container mt-12">
            <SectionHeader
              id="register-heading"
              icon="list"
              tone="neutral"
              title="Day by day"
              description="One row per day for each tank. The running totals are at the right-hand end, in the grey band."
            />

            <div className="space-y-5">
              {tanks.map((tank) => (
                <TankRegister key={tank.tank_id} tank={tank} />
              ))}
            </div>

            {/* The note names the columns exactly as the headings do - "Should
                be", "Dip", "Gain / loss" - so the reader can match a sentence
                to a column without translating. It said "Books" and "variance"
                while the table said something else, which is how a legend
                stops being read. */}
            <Notice tone="info" title="Reading the register" className="mt-5">
              <span className="font-semibold">Should be</span> is the opening stock plus what was
              delivered, less what the meters sold. <span className="font-semibold">Dip</span> is
              what the rod actually measured at the close of that day, and the{' '}
              <span className="font-semibold">gain / loss</span> is the difference between the two.
              A dip taken in the morning closes the day before, as it does on the Stock page.
            </Notice>
          </section>
        </>
      ) : null}
    </>
  );
}

/** "01 Sep" - the day and the month, for a span the heading has already dated. */
function dayMonth(iso) {
  return formatDate(iso).slice(0, 6);
}

/**
 * One fuel's headline over the chosen days: what it sold, and where its stock
 * ended up against the dips.
 *
 * THE DASHBOARD'S FUEL CARD, CUT TO THIS PAGE'S TWO QUESTIONS: the fuel's
 * quiet `soft` band with a dot of its true hue and its name in words (colour
 * is never the only cue, and these two cards sit side by side carrying figures
 * that look alike), then what was sold, then - under a rule, in the card's
 * grey foot - what the dips found. They answer different questions (how much
 * did we sell; did the tank agree), and read side by side the smaller looks
 * like a part of the larger.
 *
 * NO DIP IN THE RANGE SAYS SO. The running gain / loss treats an undipped day
 * as nothing, so a run of days nobody measured adds up to exactly zero, and
 * this card used to print that as "0 L" - which reads as "measured, and
 * exact", the one thing the table's own "No dip" is there to prevent.
 */
function FuelCard({ fuelType, rows, range }) {
  const color = fuelColor(fuelType);
  const name = color.label || fuelType;
  const headingId = `register-fuel-${fuelType}`;
  const last = rows[rows.length - 1];

  const litres = Number(last?.cumulative_sales ?? 0);
  // Money, added in whole paisa (sumMoney): the days' takings are the
  // database's figures, and a double sum of them can drift a paisa.
  const value = sumMoney(rows.map((row) => row.sale_amount));
  const variance = Number(last?.cumulative_variance ?? 0);
  const variancePct =
    last?.cumulative_variance_pct === null || last?.cumulative_variance_pct === undefined
      ? null
      : Number(last.cumulative_variance_pct);
  const dipped = rows.some((row) => row.closing_dip !== null && row.closing_dip !== undefined);

  /*
   * THE DAILY SHAPE OF WHAT THE HEADLINE TOTALS UP, from the rows this card is
   * already given - no second query, and no way for the line and the figure
   * above it to disagree about a day. It wears the fuel's `onWhite` colour, the
   * dark relative, because diesel's real #FDBA74 as a 2px line on white is
   * 1.6:1 and all but invisible.
   */
  const daily = rows.map((row) => Number(row.meter_sales ?? 0));
  const dailyTips = rows.map((row) => ({
    v: `${formatNumber(Number(row.meter_sales ?? 0))} L`,
    d: formatDate(row.day),
  }));

  return (
    <article
      data-card
      aria-labelledby={headingId}
      className="panel @container flex min-w-0 flex-col overflow-hidden"
    >
      <div className={`flex items-center gap-3 px-5 py-3 ${color.soft}`}>
        <h3 id={headingId} className="flex items-center gap-2.5 text-lg font-bold">
          <span
            className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-inset ring-black/15"
            style={{ backgroundColor: color.raw }}
            aria-hidden="true"
          />
          {name}
        </h3>
      </div>

      <div className="px-5 pb-4 pt-4">
        <p className="caption">
          Sold from {dayMonth(range.from)} to {dayMonth(range.to)}
        </p>
        {/* nowrap on each figure: "17,504 L" broken after the number reads for
            a moment as two separate figures. */}
        <p className="tabular mt-1 whitespace-nowrap text-3xl font-bold tracking-tight text-ink-900">
          {formatLitres(litres)}
        </p>
        <p className="tabular mt-0.5 whitespace-nowrap text-lg font-semibold text-ink-700">
          {formatPKR(value)}
        </p>
      </div>

      {/* A band the width of the card, as on KpiCard. Two days is the fewest
          that can show a direction; below that Sparkline draws nothing and
          the band is simply absent. */}
      {daily.length > 1 ? (
        <div className={`h-14 ${color.onWhite}`}>
          <Sparkline data={daily} tips={dailyTips} className="h-full w-full" />
        </div>
      ) : null}

      <div className="mt-auto border-t border-ink-200/70 bg-ink-50 px-5 py-4">
        <p className="caption">Gain or loss against the dips</p>
        {dipped ? (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
            <p
              className={`tabular whitespace-nowrap text-2xl font-bold ${
                variance > 0 ? 'text-brand-700' : variance < 0 ? 'text-red-700' : 'text-ink-900'
              }`}
            >
              {variance > 0 ? '+' : variance < 0 ? '−' : ''}
              {formatLitres(Math.abs(variance))}
            </p>
            <VariancePill variance={variance} variancePct={variancePct} />
          </div>
        ) : (
          <p className="mt-1 text-base text-ink-700">No dip was taken on these days.</p>
        )}
      </div>
    </article>
  );
}

/**
 * The gain or loss as a share of what was sold: the Dashboard's dip pill. The
 * figure beside it carries the sign and the caption over it the words, so the
 * pill is the arrow (the direction as a shape) and the share; the colour is
 * the third cue, never the only one.
 *
 * ONE LINE, ALWAYS. It said "A loss of 0.35% of what was sold" first, and on a
 * phone that broke inside the pill - a two-line capsule - and would not fit a
 * 320px card at all if held to one line. Short enough now to drop under the
 * figure whole.
 */
function VariancePill({ variance, variancePct }) {
  if (variance === 0) {
    return (
      <span className="inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-ink-100 px-3 py-1.5 text-sm font-semibold text-ink-700">
        <Icon name="check" className="h-4 w-4" />
        Matches the books exactly
      </span>
    );
  }

  if (variancePct === null) return null;

  const gain = variance > 0;
  return (
    <span
      className={`tabular inline-flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold ${
        gain ? 'bg-brand-50 text-brand-800' : 'bg-red-50 text-red-800'
      }`}
    >
      <svg viewBox="0 0 12 12" className="h-3 w-3 shrink-0" aria-hidden="true">
        <path d={gain ? 'M6 2 10.5 9h-9Z' : 'M6 10 1.5 3h9Z'} fill="currentColor" />
      </svg>
      <span className="sr-only">{gain ? 'A gain of' : 'A loss of'}</span>
      {Math.abs(variancePct).toFixed(2)}% of what was sold
    </span>
  );
}

/**
 * One tank's register, in a panel headed by its fuel's quiet band - the same
 * band as its card at the top of the page, so the eye can go from one to the
 * other by colour as well as by name.
 */
function TankRegister({ tank }) {
  const color = fuelColor(tank.fuel_type);
  const headingId = `register-tank-${tank.tank_id}`;
  // The fuel in words beside a tank whose name does not already say it: the
  // seeded names do ("Diesel Tank"), a renamed "Tank 2" would not.
  const namesFuel = String(tank.name ?? '')
    .toLowerCase()
    .includes(String(color.label ?? '').toLowerCase());

  return (
    <article
      data-card
      aria-labelledby={headingId}
      className="panel @container overflow-hidden"
    >
      <div className={`flex items-center justify-between gap-3 px-5 py-3 ${color.soft}`}>
        <h3 id={headingId} className="flex items-center gap-2.5 text-lg font-bold">
          <span
            className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-inset ring-black/15"
            style={{ backgroundColor: color.raw }}
            aria-hidden="true"
          />
          {tank.name}
        </h3>
        {namesFuel ? null : <span className="text-base font-semibold">{color.label}</span>}
      </div>
      <RegisterTable rows={tank.rows} />
    </article>
  );
}
