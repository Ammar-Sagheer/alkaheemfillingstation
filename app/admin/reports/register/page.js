import { requirePageRole, ROLES, todayISO } from '@/app/_lib/helpers';
import {
  getStockRegister,
  getRangeSummary,
  getSalesTrend,
  getPurchaseTotalsByDay,
  getExpenseTotalsByDay,
} from '@/app/_lib/data-service';
import RegisterView from '@/app/_components/admin/reports/RegisterView';

export const metadata = { title: 'Sale & stock register' };

/**
 * The Daily Sale & Stock Register: the range, the role check and the queries.
 * `RegisterView` draws it, in the new look, and says what the page is for.
 */

/**
 * Day 1 to TODAY in the current month; day 1 to the last day in any other.
 *
 * The default used to be the whole month either way, which on the 3rd of
 * August meant a register headed "01 Aug - 31 Aug" with twenty-eight empty
 * days hanging off the bottom of it - and a profit figure comparing three
 * days of sales against whatever deliveries had landed, over a span the
 * heading said was a month. A register's most common question is "how are we
 * doing so far", and so far ends today.
 *
 * A PAST month still defaults to all of it, because there "so far" and "the
 * whole month" are the same span, and clamping to today's day-of-month would
 * cut June short at the 15th for no reason.
 */
function resolveRange(params) {
  const today = todayISO();

  const month =
    typeof params?.month === 'string' && /^\d{4}-\d{2}$/.test(params.month)
      ? params.month
      : today.slice(0, 7);

  const [year, monthNumber] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();

  /*
   * Clamped to the month, never trusted. `?from=0` would ask Postgres for a
   * date of "2026-08-00" and `?from=400` for four hundred days of rows - the
   * same lesson `trendDaysFrom` (TrendWindow.js) records about validating against the allowed
   * set rather than `Number() || 14`.
   */
  const clamp = (value, fallback) => {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1 || n > lastDay) return fallback;
    return n;
  };

  /* `today.slice(8)` is the day-of-month in Asia/Karachi, which is what
     todayISO() is pinned to - not the server's clock. See date-helpers.js. */
  const isCurrentMonth = month === today.slice(0, 7);
  const defaultToDay = isCurrentMonth ? Math.min(Number(today.slice(8, 10)), lastDay) : lastDay;

  let fromDay = clamp(params?.from, 1);
  let toDay = clamp(params?.to, defaultToDay);

  // Entered backwards, they are swapped rather than refused. The reader asked
  // for the days between two numbers and that is unambiguous either way round.
  if (fromDay > toDay) [fromDay, toDay] = [toDay, fromDay];

  const pad = (n) => String(n).padStart(2, '0');

  return {
    month,
    fromDay,
    toDay,
    from: `${month}-${pad(fromDay)}`,
    to: `${month}-${pad(toDay)}`,
    days: toDay - fromDay + 1,
  };
}

/**
 * The equally long span ending the day before this one starts.
 *
 * Worked out in UTC on purpose: these are plain calendar dates with no clock
 * attached, and `Date.UTC` is the one arithmetic that cannot be shifted by the
 * server's timezone. The business day is pinned to Asia/Karachi elsewhere (see
 * date-helpers.js) but that matters for deciding WHICH day it is now, not for
 * counting backwards from a date already chosen.
 */
function previousRange(range) {
  const start = new Date(`${range.from}T00:00:00Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() - 1);
  start.setUTCDate(start.getUTCDate() - range.days);
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
  };
}

export default async function RegisterPage({ searchParams }) {
  await requirePageRole(ROLES.SUPER_ADMIN);

  const params = await searchParams;
  const range = resolveRange(params);

  /*
   * THE SPAN BEFORE THIS ONE, of exactly the same length, ending the day
   * before it starts. That is what the percent badges compare against, and it
   * is the only comparison that is fair: "this week against last week", not
   * "these four days against a whole month". `getRangeSummary` is one RPC, so
   * the comparison costs one more round trip and no new SQL.
   */
  const previous = previousRange(range);

  const [rows, summary, previousSummary, salesTrend, purchaseDays, expenseDays] = await Promise.all(
    [
      getStockRegister(range.from, range.to),
      getRangeSummary(range.from, range.to),
      getRangeSummary(previous.from, previous.to),
      getSalesTrend(range.from, range.to),
      getPurchaseTotalsByDay(range.from, range.to),
      getExpenseTotalsByDay(range.from, range.to),
    ],
  );

  return (
    <RegisterView
      range={range}
      previous={previous}
      rows={rows}
      summary={summary}
      previousSummary={previousSummary}
      salesTrend={salesTrend}
      purchaseDays={purchaseDays}
      expenseDays={expenseDays}
    />
  );
}
