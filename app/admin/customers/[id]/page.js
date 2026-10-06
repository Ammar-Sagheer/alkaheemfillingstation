import { notFound } from 'next/navigation';

import { requirePageRole, ROLES, todayISO } from '@/app/_lib/helpers';
import {
  getCustomerStatement,
  getLedgerEntriesPage,
  getLedgerEntriesForStatement,
} from '@/app/_lib/data-service';
import { prepareAccountRows } from '@/app/_lib/customer-statement';
import { pageFrom } from '@/app/_components/ui/Pager';
import CustomerView, { PER_PAGE } from '@/app/_components/admin/customers/CustomerView';

export async function generateMetadata({ params }) {
  const { id } = await params;
  try {
    const statement = await getCustomerStatement(id);
    return { title: statement?.customer?.name ?? 'Customer' };
  } catch {
    return { title: 'Customer' };
  }
}

/**
 * One customer's account. The role check and the queries; `CustomerView`
 * draws it, in the new look, split the same way as the Dashboard so it can be
 * rendered from fixtures.
 */
export default async function CustomerDetailPage({ params, searchParams }) {
  const profile = await requirePageRole(ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY);
  const { id } = await params;
  const params_ = await searchParams;
  const page = pageFrom(params_);

  // Set by the statement route when the PDF could not be produced. Trimmed, and
  // cleared out of the URL by DownloadNotice once it has been read.
  const statementError =
    typeof params_?.statement_error === 'string' ? params_.statement_error.slice(0, 300) : null;

  /*
   * The balance and the fuel breakdown come from the statement RPC, which sums
   * over the whole ledger in Postgres - so paging the ENTRIES here changes only
   * what is listed, never what is owed. That is what makes a database page safe
   * on this screen and not on Purchases.
   */
  const [statement, { rows: entries, total: entryCount, correctedIds }, allEntries] =
    await Promise.all([
      getCustomerStatement(id),
      getLedgerEntriesPage(id, { page, perPage: PER_PAGE }),
      /*
       * The WHOLE ledger, for the statement preview only: the statement lists
       * every fill and every payment, so it is the one thing on the page that
       * cannot be answered from a page of 25. Prepared here, once; the dialog
       * re-windows the rows in the browser as the reader changes the range.
       */
      getLedgerEntriesForStatement(id),
    ]);

  const customer = statement?.customer;
  if (!customer) notFound();

  return (
    <CustomerView
      customer={customer}
      statement={statement}
      entries={entries}
      entryCount={entryCount}
      correctedIds={correctedIds}
      // Serialisable, and the same rows the download route builds its PDF from.
      account={{ rows: prepareAccountRows(allEntries) }}
      page={page}
      asOf={todayISO()}
      isOwner={profile.role === ROLES.SUPER_ADMIN}
      statementError={statementError}
    />
  );
}
