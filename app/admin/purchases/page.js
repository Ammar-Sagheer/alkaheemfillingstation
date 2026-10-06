import { requirePageRole, ROLES } from '@/app/_lib/helpers';
import {
  getPurchases,
  getTanks,
  getLubricantPurchases,
  getLubricants,
  getSupplierNames,
} from '@/app/_lib/data-service';
import { pageFrom } from '@/app/_components/ui/Pager';
import PurchasesView from '@/app/_components/admin/purchases/PurchasesView';

export const metadata = { title: 'Purchases' };

/**
 * Everything the pump buys in. The role check and the queries; `PurchasesView`
 * draws it, in the new look, split the same way as the Dashboard so it can be
 * rendered from fixtures.
 */
export default async function PurchasesPage({ searchParams }) {
  const profile = await requirePageRole(ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY);
  const page = pageFrom(await searchParams);
  const [tanks, fuelPurchases, lubricantPurchases, lubricants, suppliers] = await Promise.all([
    getTanks(),
    getPurchases(),
    getLubricantPurchases(),
    getLubricants(),
    getSupplierNames(),
  ]);

  return (
    <PurchasesView
      page={page}
      tanks={tanks}
      fuelPurchases={fuelPurchases}
      lubricantPurchases={lubricantPurchases}
      lubricants={lubricants}
      suppliers={suppliers}
      isOwner={profile.role === ROLES.SUPER_ADMIN}
    />
  );
}
