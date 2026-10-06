import { notFound } from 'next/navigation';

import { requirePageRole, ROLES } from '@/app/_lib/helpers';
import {
  getSupplierSummaries,
  getSupplierLedgerPage,
  getBankAccounts,
  getTreasuryOverview,
} from '@/app/_lib/data-service';
import { pageFrom } from '@/app/_components/ui/Pager';
import SupplierView, { PER_PAGE } from '@/app/_components/admin/suppliers/SupplierView';

export async function generateMetadata({ params }) {
  const { id } = await params;
  try {
    const suppliers = await getSupplierSummaries();
    return { title: suppliers.find((row) => row.id === id)?.name ?? 'Supplier' };
  } catch {
    return { title: 'Supplier' };
  }
}

/**
 * One supplier's account. The role check and the queries; `SupplierView` draws
 * it. The bank accounts and the safe's balance are for the payment dialog,
 * which says what each can pay before the database has to refuse.
 */
export default async function SupplierPage({ params, searchParams }) {
  await requirePageRole(ROLES.SUPER_ADMIN);
  const { id } = await params;
  const page = pageFrom(await searchParams);

  const [suppliers, { rows: entries, total: entryCount, correctedIds }, bankAccounts, treasury] =
    await Promise.all([
      getSupplierSummaries(),
      getSupplierLedgerPage(id, { page, perPage: PER_PAGE }),
      getBankAccounts(),
      getTreasuryOverview(7).catch(() => null),
    ]);

  const supplier = suppliers.find((row) => row.id === id);
  if (!supplier) notFound();

  return (
    <SupplierView
      supplier={supplier}
      entries={entries}
      entryCount={entryCount}
      correctedIds={correctedIds}
      page={page}
      bankAccounts={bankAccounts ?? []}
      safeBalance={treasury ? Number(treasury.balance ?? 0) : null}
    />
  );
}
