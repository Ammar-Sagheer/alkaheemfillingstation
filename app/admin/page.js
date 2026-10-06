import { requirePageRole, ROLES, todayISO, shiftISODate } from '@/app/_lib/helpers';
import {
  getDailySummary,
  getSalesTrend,
  getLubricantTrend,
  getMonthEndStock,
  getTanks,
  getNozzles,
  getCurrentRates,
} from '@/app/_lib/data-service';
import TitleHeader from '@/app/_components/admin/dashboard/TitleHeader';
import SetupChecklist from '@/app/_components/admin/dashboard/SetupChecklist';
import { trendDaysFrom } from '@/app/_components/admin/dashboard/TrendWindow';
import DashboardView from '@/app/_components/admin/dashboard/DashboardView';

export const metadata = { title: 'Dashboard' };

/**
 * The Dashboard: the role check and the three queries. Everything it draws is
 * in `DashboardView` - see that file for why the two are split.
 *
 * The new look (docs/UI_CONVENTIONS.md -> "The new look") starts here; the
 * rest of the site is to follow it. The data is exactly what the old page
 * fetched, in the same three calls, in parallel.
 */
export default async function DashboardPage({ searchParams }) {
  await requirePageRole(ROLES.SUPER_ADMIN);

  /* Al Hakeem (migration 800): the owner sets up his own forecourt, so a new
     pump has no tanks or nozzles. Until it has a tank, a nozzle and a price
     for every fuel a tank holds, the Dashboard is the setup checklist - the
     page he lands on is the one that tells him what to do first. */
  const [tanks, nozzles, rates] = await Promise.all([getTanks(), getNozzles(), getCurrentRates()]);
  const liveNozzles = nozzles.filter((nozzle) => nozzle.is_active && !nozzle.retired_on);
  const fuels = [...new Set(tanks.map((tank) => tank.fuel_type))];
  const missingPrices = fuels.filter((fuel) => rates[fuel] == null);
  if (tanks.length === 0 || liveNozzles.length === 0 || missingPrices.length > 0) {
    return (
      <>
        <TitleHeader
          title="Welcome"
          icon="dashboard"
          tone="money"
          description="Set up your tanks, nozzles and prices, and the Dashboard takes over from here."
        />
        <SetupChecklist
          status={{ tanks: tanks.length, nozzles: liveNozzles.length, missingPrices }}
        />
      </>
    );
  }

  const params = await searchParams;
  const date =
    typeof params?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
      ? params.date
      : todayISO();

  /* The charts end on the day the rest of the dashboard is showing; this is
     only how far back they reach. Both controls write to the query string, so
     each one has to carry the other's value forward or picking a window would
     silently throw the reader back to today. */
  const trendDays = trendDaysFrom(params);
  const trendFrom = shiftISODate(date, -(trendDays - 1));

  /* The month before the one being shown: its closing stock is this month's
     opening stock, and both are the figures the monthly profit is built on.
     Its own failure is caught, so the stock table cannot take the rest of
     the morning check down with it. */
  const [year, month] = date.split('-').map(Number);
  const closedYear = month === 1 ? year - 1 : year;
  const closedMonth = month === 1 ? 12 : month - 1;

  const [summary, trend, lubricantTrend, monthEndStock] = await Promise.all([
    getDailySummary(date),
    getSalesTrend(trendFrom, date),
    getLubricantTrend(trendFrom, date),
    getMonthEndStock(closedYear, closedMonth).catch((error) => ({ error: error.message })),
  ]);

  return (
    <DashboardView
      date={date}
      trendDays={trendDays}
      trendFrom={trendFrom}
      summary={summary}
      trend={trend}
      lubricantTrend={lubricantTrend}
      monthEndStock={monthEndStock}
    />
  );
}
