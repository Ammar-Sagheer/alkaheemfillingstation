import { requirePageRole, ROLES } from '@/app/_lib/helpers';
import { getBankAccounts, getBankTransactionsPage } from '@/app/_lib/data-service';
import { pageFrom } from '@/app/_components/ui/Pager';
import BankingView, { PER_PAGE } from '@/app/_components/admin/banking/BankingView';

export const metadata = { title: 'Banking' };

/**
 * The owner's bank accounts. The role check and the queries; `BankingView`
 * draws it, in the new look, split the same way as the Dashboard so it can be
 * rendered from fixtures.
 *
 * Owner only. Staff record readings and deliveries; what is in the account is
 * not theirs to see, the same way expenses already are not.
 */
export default async function BankingPage({ searchParams }) {
  await requirePageRole(ROLES.SUPER_ADMIN);
  const page = pageFrom(await searchParams);

  const [accounts, { rows, total }] = await Promise.all([
    getBankAccounts(),
    getBankTransactionsPage({ page, perPage: PER_PAGE }),
  ]);

  return <BankingView page={page} accounts={accounts} transactions={rows} total={total} />;
}
