import { requirePageRole, ROLES, todayISO, monthRange } from '@/app/_lib/helpers';
import { withoutDashes } from '@/app/_lib/format-helpers';
import { getMonthlyReport, getSalesTrend, getMonthEndStock } from '@/app/_lib/data-service';
import ReportsView from '@/app/_components/admin/reports/ReportsView';

export const metadata = { title: 'Reports' };

/**
 * The month's report. The role check and the queries; `ReportsView` draws it,
 * in the new look, split the same way as the Dashboard so it can be rendered
 * from fixtures.
 */
export default async function ReportsPage({ searchParams }) {
  await requirePageRole(ROLES.SUPER_ADMIN);

  const params = await searchParams;
  const today = todayISO();

  // The month box posts back as YYYY-MM.
  const monthParam =
    typeof params?.month === 'string' && /^\d{4}-\d{2}$/.test(params.month)
      ? params.month
      : today.slice(0, 7);

  const [year, month] = monthParam.split('-').map(Number);

  // Set by the export route when the download could not be produced. Trimmed,
  // because it goes on screen and arrives from the query string.
  const exportError =
    typeof params?.export_error === 'string'
      ? withoutDashes(params.export_error.slice(0, 300))
      : null;

  // The charts and the day-by-day table follow the month box, like everything
  // else on this page, and agree with the Excel download, which is month-based.
  const { from: monthFrom, to: monthTo } = monthRange(year, month);

  const [report, trend, monthEndStock] = await Promise.all([
    getMonthlyReport(year, month),
    getSalesTrend(monthFrom, monthTo),
    getMonthEndStock(year, month).catch((error) => ({ error: error.message })),
  ]);

  return (
    <ReportsView
      monthParam={monthParam}
      year={year}
      month={month}
      report={report}
      trend={trend}
      monthEndStock={monthEndStock}
      today={today}
      exportError={exportError}
    />
  );
}
