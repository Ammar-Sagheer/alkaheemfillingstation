import { requirePageRole, ROLES } from '@/app/_lib/helpers';
import { getTreasuryOverview, getTreasuryDay } from '@/app/_lib/data-service';
import { trendDaysFrom } from '@/app/_components/admin/dashboard/TrendWindow';
import TreasuryView from '@/app/_components/admin/treasury/TreasuryView';

export const metadata = { title: 'Treasury' };

/**
 * The cash in the safe on the pump site. The role check and the queries;
 * `TreasuryView` draws it, in the new look, split the same way as the
 * Dashboard so it can be rendered from fixtures.
 *
 * Owner only, like Banking and Expenses. This is his own cash.
 */
export default async function TreasuryPage({ searchParams }) {
  await requirePageRole(ROLES.SUPER_ADMIN);

  const params = await searchParams;
  const days = trendDaysFrom(params);

  /*
   * `?date=` picks the day, and anything at all is safe to pass: the RPC
   * resolves a day with no entries to the nearest one that has some. Only the
   * shape is checked here - whether that date exists is the database's
   * question.
   */
  const askedFor = /^\d{4}-\d{2}-\d{2}$/.test(params?.date ?? '') ? params.date : null;

  const [overview, dayPage] = await Promise.all([
    getTreasuryOverview(days),
    getTreasuryDay(askedFor),
  ]);

  return <TreasuryView days={days} askedFor={askedFor} overview={overview} dayPage={dayPage} />;
}
