import { requirePageRole, ROLES } from '@/app/_lib/helpers';
import { getCustomerBalances, getRetiredCustomers } from '@/app/_lib/data-service';
import CustomersView from '@/app/_components/admin/customers/CustomersView';

export const metadata = { title: 'Customers' };

/**
 * Credit accounts and what each one owes. The role check and the queries;
 * `CustomersView` draws it, in the new look, split the same way as the
 * Dashboard so it can be rendered from fixtures.
 */
export default async function CustomersPage({ searchParams }) {
  const profile = await requirePageRole(ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY);
  const isOwner = profile.role === ROLES.SUPER_ADMIN;

  const params = await searchParams;
  const query = typeof params?.q === 'string' ? params.q.trim() : '';

  // Removed customers are only fetched for the owner, who is the only one who
  // can act on them - staff would get a list they cannot use.
  const [customers, retired] = await Promise.all([
    getCustomerBalances(),
    isOwner ? getRetiredCustomers() : Promise.resolve([]),
  ]);

  return <CustomersView customers={customers} retired={retired} query={query} isOwner={isOwner} />;
}
