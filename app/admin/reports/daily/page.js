import { requirePageRole, ROLES } from '@/app/_lib/helpers';
import { getSalesTrend, getFirstTradingDay } from '@/app/_lib/data-service';
import { todayISO, shiftISODate, daysBetween } from '@/app/_lib/date-helpers';
import DailySalesView from '@/app/_components/admin/reports/DailySalesView';

export const metadata = { title: 'Daily sales' };

/**
 * Every day the pump has traded, newest first, a screenful at a time.
 *
 * Reports shows the same table for the month on screen, which is the right
 * thing when the question is "how did August go". This is for the other
 * question - "what did we take on the day that customer says he paid" - where
 * the month is not known in advance and paging back is the whole point.
 *
 * PAGED BY DATE, NOT BY ROW. get_sales_trend fills in every day between two
 * bounds, including the ones with no trade at all, so a page IS a fixed window
 * of days: page 1 is the last 25 days, page 2 the 25 before that. That is why
 * there is no row count to fetch - the number of pages falls out of the
 * distance between the first trading day and today.
 *
 * The page number is a query string, so Back works through it and any page can
 * be linked to or reloaded.
 */
const PER_PAGE = 25;

export default async function DailySalesPage({ searchParams }) {
  await requirePageRole(ROLES.SUPER_ADMIN);

  const params = await searchParams;
  const requested = Number.parseInt(params?.page, 10);
  const page = Number.isInteger(requested) && requested > 0 ? requested : 1;

  const today = todayISO();
  const firstDay = (await getFirstTradingDay()) ?? today;

  const totalDays = Math.max(1, daysBetween(firstDay, today));
  const lastPage = Math.max(1, Math.ceil(totalDays / PER_PAGE));
  const safePage = Math.min(page, lastPage);

  // Walk backwards from today in PER_PAGE-sized windows, then clamp the far
  // edge so the last page stops at the first day rather than inventing history.
  const to = shiftISODate(today, -(safePage - 1) * PER_PAGE);
  const rawFrom = shiftISODate(to, -(PER_PAGE - 1));
  const from = rawFrom < firstDay ? firstDay : rawFrom;

  const trend = await getSalesTrend(from, to);

  // The RPC returns oldest first, which is right for a chart drawn left to
  // right. Read as a list, the day just gone belongs at the top.
  const rows = [...trend].reverse();

  return (
    <DailySalesView
      rows={rows}
      from={from}
      to={to}
      firstDay={firstDay}
      page={safePage}
      lastPage={lastPage}
    />
  );
}
