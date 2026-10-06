// helpers.js, not format-helpers.js: both callers are Server Components, and
// that is where formatPKR and formatLitres live.
import { formatLitres, formatPKR } from '@/app/_lib/helpers';
import { formatDate } from '@/app/_lib/date-helpers';

/**
 * A day per row: litres, the split by fuel, and what the money did.
 *
 * Shared by the collapsible block on Reports, which shows the chosen month,
 * and the Daily sales page, which pages back through every day the pump has
 * traded. One component because the columns have to line up between them -
 * someone checking a figure on the history page against the month they were
 * just looking at should not have to re-read the headings.
 */
/*
 * `framed` puts the table in a `.panel` of its own, with the new look's 20px
 * edges on its first and last columns - the Daily sales page. Unframed it sits
 * bare inside something that is already a surface: the Reports dialog. Either
 * way it scrolls inside itself (`mx-0 px-0`), without the phone-width bleed.
 */
/*
 * 10px either side of every cell rather than the usual 12, which is what lets
 * the 20px panel edges in without a sideways scroll at 1152px beside a pinned
 * sidebar: with them and the usual padding the table needed 892px of an 878px
 * panel, 14px short, on an ordinary six-figure day.
 */
export default function DailySalesTable({ rows, framed = false }) {
  const first = framed ? 'pl-5' : '';
  const last = framed ? 'pr-5' : '';

  const table = (
    <div className="table-scroll mx-0 px-0">
      <table className="w-full min-w-[46rem]">
        <thead>
          <tr>
            <th className={`th px-2.5 ${first}`}>Date</th>
            <th className="th px-2.5 text-right">Litres</th>
            <th className="th px-2.5 text-right">Petrol</th>
            <th className="th px-2.5 text-right">Diesel</th>
            <th className="th px-2.5 text-right">Fuel sales</th>
            <th className="th px-2.5 text-right">Cash</th>
            <th className="th px-2.5 text-right">Credit</th>
            <th className={`th px-2.5 text-right ${last}`}>Lubricants</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {rows.map((row) => (
            <tr key={row.day}>
              <td className={`td whitespace-nowrap px-2.5 font-semibold text-ink-900 ${first}`}>
                {formatDate(row.day)}
              </td>
              <td className="td-num px-2.5">{formatLitres(row.litres_sold)}</td>
              <td className="td-num px-2.5">{formatLitres(row.petrol_litres)}</td>
              <td className="td-num px-2.5">{formatLitres(row.diesel_litres)}</td>
              <td className="td-num px-2.5 font-semibold">{formatPKR(row.sale_amount)}</td>
              <td className="td-num px-2.5">{formatPKR(row.cash_amount)}</td>
              <td className="td-num px-2.5">{formatPKR(row.credit_amount)}</td>
              {/* Litres and money together in one column: a lubricant day is a
                  handful of tins, so two columns of mostly blanks would cost
                  more width than the figures are worth. A day with none is
                  left blank rather than dashed. */}
              <td className={`td-num px-2.5 text-ink-700 ${last}`}>
                {Number(row.lubricant_amount) > 0
                  ? `${formatLitres(row.lubricant_litres)} · ${formatPKR(row.lubricant_amount)}`
                  : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return framed ? (
    <div data-card className="panel overflow-hidden">
      {table}
    </div>
  ) : (
    table
  );
}
