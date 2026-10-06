import FuelBadge from '@/app/_components/ui/FuelBadge';

import { formatDate } from '@/app/_lib/date-helpers';
import { formatLitres, formatPKR, formatRate } from '@/app/_lib/format-helpers';
import { byFuelOrder } from '@/app/_lib/fuel-colors';

/**
 * The stock on one date, per fuel, written out the way an accountant writes a
 * closing stock: litres, rate, value (migration 068).
 *
 * WHY IT EXISTS. Profit takes the opening and closing stock values, and until
 * this they were only ever printed as one combined sum inside a sentence on
 * Reports. The owner's accountant works the month out by hand, the two
 * profits disagreed for September 2026, and there was nowhere to read "749 L
 * of diesel at Rs 392.89 = Rs 294,276" to tick against the accountant's sheet.
 *
 * TWO VALUES, SIDE BY SIDE, and the one profit used. Stock is carried at the
 * LOWER of what it cost (the deliveries it is made of, newest first - 049) and
 * the pump price that day (069, the IAS 2 / Income Tax Ordinance s.35 rule).
 * Usually that is the cost, and an accountant who values closing stock at the
 * pump price gets a higher profit by the gap, which is said in words
 * underneath. After a price cut below cost it is the pump price, and the
 * sentence says the stock was written down instead.
 *
 * Nothing is added up here: every total, including the gap, comes back from
 * Postgres (`stock_totals`).
 *
 * `side` is 'closing' or 'opening'; `stock` is get_month_end_stock's result.
 */
export default function MonthEndStock({ stock, side = 'closing', asOf = null }) {
  // A month that has not ended has no closing stock yet: the database holds
  // nothing past today, so "the close of 31 Oct" is simply what is in the
  // tanks now. The caller passes today as `asOf` and the words follow it.
  const onDate = asOf ?? stock?.[side]?.on;
  const fuels = [...(stock?.fuels ?? [])].sort(byFuelOrder);
  const totals = stock?.[side] ?? {};
  const lubricantsValue = Number(totals.lubricants_value ?? 0);
  const gap = Number(totals.fuel_sell_gap ?? 0);
  const writtenDown = fuels.filter((fuel) => fuel[side]?.written_down);

  return (
    <div data-card className="panel @container overflow-hidden">
      {/* NARROW: one block per fuel, every figure on its own line. A sideways
          table on a phone hid the value column, which is the figure the page
          exists to show. */}
      <div className="divide-y divide-ink-200 @[52rem]:hidden">
        {fuels.map((fuel) => {
          const row = fuel[side] ?? {};
          const hasStock = Number(row.litres ?? 0) > 0;
          return (
            <dl key={fuel.fuel_type} className="grid gap-1.5 px-4 py-4">
              <div className="mb-1">
                <FuelBadge fuelType={fuel.fuel_type} />
              </div>
              <Line label="Litres left" value={formatLitres(row.litres)} strong />
              <Line label="Cost a litre" value={hasStock && row.cost_rate !== null ? formatRate(row.cost_rate) : 'None'} />
              <Line label="Value at cost" value={formatPKR(row.cost_value)} />
              <Line label="Pump price" value={row.sell_rate != null ? formatRate(row.sell_rate) : 'Not set'} />
              <Line label="Value at pump price" value={row.sell_value != null ? formatPKR(row.sell_value) : 'None'} />
              <Line label={`Used in profit (${usedLabel(row)})`} value={formatPKR(row.value)} strong />
            </dl>
          );
        })}
        {lubricantsValue > 0 ? (
          <dl className="grid gap-1.5 px-4 py-4">
            <div className="mb-1">
              <FuelBadge fuelType="lubricant" />
            </div>
            <Line label="On the shelf, at cost" value={formatPKR(lubricantsValue)} strong />
          </dl>
        ) : null}
        <dl className="grid gap-1.5 bg-ink-50 px-4 py-4">
          <Line
            label={lubricantsValue > 0 ? 'Fuel at cost' : 'Total at cost'}
            value={formatPKR(totals.fuel_cost_value)}
          />
          <Line
            label={lubricantsValue > 0 ? 'Fuel at pump price' : 'Total at pump price'}
            value={totals.fuel_sell_value != null ? formatPKR(totals.fuel_sell_value) : 'None'}
          />
          <Line label="Total used in profit" value={formatPKR(totals.value)} strong large />
        </dl>
      </div>

      <div className="table-scroll mx-0 hidden px-0 @[52rem]:block">
        <table className="w-full min-w-[52rem]">
          <thead>
            <tr>
              <th className="th pl-5">Fuel</th>
              <th className="th whitespace-nowrap text-right">Litres left</th>
              <th className="th whitespace-nowrap text-right">Cost a litre</th>
              <th className="th whitespace-nowrap text-right">Value at cost</th>
              <th className="th whitespace-nowrap text-right">Pump price</th>
              <th className="th whitespace-nowrap text-right">Value at pump price</th>
              <th className="th whitespace-nowrap pr-5 text-right">
                Used in profit
                <span className="block text-xs font-medium normal-case text-brand-700">the lower of the two</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {fuels.map((fuel) => {
              const row = fuel[side] ?? {};
              const hasStock = Number(row.litres ?? 0) > 0;
              return (
                <tr key={fuel.fuel_type}>
                  <td className="td pl-5">
                    <FuelBadge fuelType={fuel.fuel_type} />
                  </td>
                  <td className="td-num font-semibold text-ink-900">{formatLitres(row.litres)}</td>
                  <td className="td-num">{hasStock && row.cost_rate !== null ? formatRate(row.cost_rate) : 'None'}</td>
                  <td className="td-num">{formatPKR(row.cost_value)}</td>
                  <td className="td-num">{row.sell_rate != null ? formatRate(row.sell_rate) : 'Not set'}</td>
                  <td className="td-num">{row.sell_value != null ? formatPKR(row.sell_value) : 'None'}</td>
                  <td className="td-num pr-5 font-bold text-ink-900">
                    {formatPKR(row.value)}
                    <span
                      className={`block text-xs font-semibold ${row.written_down ? 'text-red-700' : 'text-ink-600'}`}
                    >
                      {usedLabel(row)}
                    </span>
                  </td>
                </tr>
              );
            })}
            {lubricantsValue > 0 ? (
              <tr>
                <td className="td pl-5">
                  <FuelBadge fuelType="lubricant" />
                </td>
                <td className="td-num text-ink-600" colSpan={2}>
                  On the shelf
                </td>
                <td className="td-num">{formatPKR(lubricantsValue)}</td>
                <td className="td-num text-ink-600" colSpan={2}>
                  At cost only
                </td>
                <td className="td-num pr-5 font-bold text-ink-900">{formatPKR(lubricantsValue)}</td>
              </tr>
            ) : null}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-ink-200 bg-ink-50">
              <td className="td pl-5 font-bold text-ink-900" colSpan={3}>
                Total stock
              </td>
              <td className="td-num font-semibold text-ink-900">
                {formatPKR(totals.fuel_cost_value)}
                {lubricantsValue > 0 ? <span className="block text-xs font-medium text-ink-600">fuel only</span> : null}
              </td>
              <td className="td" />
              <td className="td-num font-semibold text-ink-900">
                {totals.fuel_sell_value != null ? formatPKR(totals.fuel_sell_value) : 'None'}
                {lubricantsValue > 0 ? <span className="block text-xs font-medium text-ink-600">fuel only</span> : null}
              </td>
              <td className="td-num pr-5 text-lg font-bold text-ink-900">{formatPKR(totals.value)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* The sentences that answer "why does the accountant get a different
          profit?" A fuel written down below cost says so first, fuel by fuel;
          otherwise the usual gap between cost and the pump price. */}
      {writtenDown.length > 0 ? (
        <div className="space-y-2 border-t border-ink-200 px-5 py-3.5 text-base text-ink-700">
          {writtenDown.map((fuel) => (
            <p key={fuel.fuel_type}>
              On {formatDate(onDate)} the {fuel.fuel_type} pump price was below what the {fuel.fuel_type} in the tank
              cost, so the profit values it at the pump price: written down by{' '}
              <span className="tabular whitespace-nowrap font-semibold text-red-700">
                {formatPKR(Math.abs(Number(fuel[side].sell_gap)))}
              </span>
              , a loss taken {side === 'closing' ? 'in this month' : 'in the month before'}, when the price fell, rather than when
              the fuel is sold.
            </p>
          ))}
        </div>
      ) : gap > 0 ? (
        <p className="border-t border-ink-200 px-5 py-3.5 text-base text-ink-700">
          At the pump price on {formatDate(onDate)}, this fuel is worth{' '}
          <span className="tabular whitespace-nowrap font-semibold text-ink-900">{formatPKR(gap)}</span> more than
          it cost. The profit uses the cost, the lower of the two. Valued at the pump price instead,{' '}
          {asOf ? 'the profit so far' : <>the month&apos;s profit</>} would come out{' '}
          {/* A higher closing stock raises a month's profit; a higher opening
              stock lowers it. */}
          {side === 'closing' ? 'higher' : 'lower'} by that much, counting margin on fuel not yet sold.
        </p>
      ) : null}
    </div>
  );
}

/** One caption and figure, for the narrow layout. The figure never wraps. */
function Line({ label, value, strong = false, large = false }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-base text-ink-700">{label}</dt>
      <dd
        className={`tabular whitespace-nowrap text-right ${strong ? 'font-bold text-ink-900' : 'text-ink-800'} ${
          large ? 'text-lg' : 'text-base'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

/** Which value the profit used for a fuel, in a word or two. */
function usedLabel(row) {
  if (row.written_down) return 'pump price, below cost';
  return 'cost';
}

