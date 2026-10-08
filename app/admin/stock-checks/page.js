import { requirePageRole, ROLES, todayISO, entryDayISO } from '@/app/_lib/helpers';
import {
  getExpectedStockForAllTanks,
  getStockChecks,
  getLubricantStock,
} from '@/app/_lib/data-service';
import { pageFrom } from '@/app/_components/ui/Pager';
import StockView from '@/app/_components/admin/stock/StockView';

export const metadata = { title: 'Stock' };

/**
 * Everything the pump is holding: the two tanks, and the lubricant shelf.
 *
 * The role check and the queries; `StockView` draws it, in the new look
 * (docs/UI_CONVENTIONS.md -> "The new look"), split the same way as the
 * Dashboard and Readings so it can be rendered from fixtures.
 *
 * For the tanks this compares what the books say should be down there against
 * what the dip stick measures:
 *
 *   expected = last measured dip + fuel delivered since - litres sold since
 *
 * The expected figure is always computed in the database, never sent up from
 * the browser, so the gain/loss number cannot be talked into saying something
 * convenient.
 */
export default async function StockChecksPage({ searchParams }) {
  const profile = await requirePageRole(ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY);

  const params = await searchParams;
  const page = pageFrom(params);
  const askedFor =
    typeof params?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
      ? params.date
      : null;
  // After midnight the page opens on the day just traded (entryDayISO).
  const date = askedFor ?? entryDayISO();
  const afterMidnight = !askedFor && date !== todayISO();

  const [tanks, checks, lubricants] = await Promise.all([
    getExpectedStockForAllTanks(date),
    getStockChecks(),
    getLubricantStock(date),
  ]);

  return (
    <StockView
      date={date}
      page={page}
      tanks={tanks}
      checks={checks}
      lubricants={lubricants}
      canManage={profile?.role === ROLES.SUPER_ADMIN}
      afterMidnight={afterMidnight}
    />
  );
}
