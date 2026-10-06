import { requirePageRole, ROLES } from '@/app/_lib/helpers';
import { getSupplierSummaries } from '@/app/_lib/data-service';
import SuppliersView from '@/app/_components/admin/suppliers/SuppliersView';

export const metadata = { title: 'Suppliers' };

/**
 * Every supplier and what the pump owes each one. Owner only, like Banking and
 * Treasury: a payment here takes money out of one of those two (067).
 */
export default async function SuppliersPage() {
  await requirePageRole(ROLES.SUPER_ADMIN);
  const suppliers = await getSupplierSummaries();
  return <SuppliersView suppliers={suppliers} />;
}
