import { requirePageRole, ROLES } from '@/app/_lib/helpers';
import { getCompanyAssetsPage, getCompanyAssetsSummary } from '@/app/_lib/data-service';
import { pageFrom } from '@/app/_components/ui/Pager';
import CompanyAssetsView, { PER_PAGE } from '@/app/_components/admin/company-assets/CompanyAssetsView';

export const metadata = { title: 'Assets' };

/**
 * What the pump owns outright. The role check and the queries;
 * `CompanyAssetsView` draws it, in the new look, split the same way as the
 * Dashboard so it can be rendered from fixtures.
 *
 * Nine to a page - three rows of three on a laptop, matching the card grid's
 * widest layout. Owner only, the same treatment as Banking: RLS refuses a
 * data_entry login outright, and hiding the nav link is cosmetic on top.
 */
export default async function CompanyAssetsPage({ searchParams }) {
  await requirePageRole(ROLES.SUPER_ADMIN);

  const page = pageFrom(await searchParams);

  const [{ rows, total }, summary] = await Promise.all([
    getCompanyAssetsPage({ page, perPage: PER_PAGE }),
    getCompanyAssetsSummary(),
  ]);

  return <CompanyAssetsView page={page} rows={rows} total={total} summary={summary} />;
}
