import { requirePageRole, ROLES, todayISO } from '@/app/_lib/helpers';
import {
  getLubricantDay,
  getLubricantStock,
  getLubricants,
  getCustomers,
} from '@/app/_lib/data-service';
import { pageFrom } from '@/app/_components/ui/Pager';
import LubricantsView from '@/app/_components/admin/lubricants/LubricantsView';

export const metadata = { title: 'Lubricants' };

/**
 * The lubricant counter: what was sold on the day, and what is left to sell.
 * The role check and the queries; `LubricantsView` draws it, in the new look,
 * split the same way as the Dashboard so it can be rendered from fixtures.
 */
export default async function LubricantsPage({ searchParams }) {
  const profile = await requirePageRole(ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY);
  const isOwner = profile.role === ROLES.SUPER_ADMIN;

  const params = await searchParams;
  const page = pageFrom(params);
  const date =
    typeof params?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
      ? params.date
      : todayISO();
  const kind = ['packed', 'loose'].includes(params?.kind) ? params.kind : 'all';

  const [day, stock, products, customers] = await Promise.all([
    getLubricantDay(date),
    getLubricantStock(date),
    // The manager needs retired products too, so a brand can be brought back.
    isOwner ? getLubricants({ includeRetired: true }) : Promise.resolve([]),
    getCustomers(),
  ]);

  return (
    <LubricantsView
      date={date}
      page={page}
      kind={kind}
      day={day}
      stock={stock}
      products={products}
      customers={customers}
      isOwner={isOwner}
    />
  );
}
