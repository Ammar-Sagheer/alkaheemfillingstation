import Link from 'next/link';

import EmptyState from '@/app/_components/ui/EmptyState';
import TitleHeader from '@/app/_components/admin/dashboard/TitleHeader';
import KpiCard, { KpiGrid } from '@/app/_components/admin/dashboard/KpiCard';
import SupplierForm from '@/app/_components/admin/suppliers/SupplierForm';
import { OwedFigure } from '@/app/_components/admin/suppliers/SupplierLedgerTable';

import { formatDate } from '@/app/_lib/date-helpers';
import { formatPKR, sumMoney } from '@/app/_lib/format-helpers';

/**
 * Every supplier, and what the pump owes each one.
 *
 * The customer list turned round (067): there, people owe the pump; here, the
 * pump owes companies. Figures come from `get_supplier_summaries`, summed in
 * Postgres over every entry, net of cancellations.
 *
 * A BALANCE IS SAID WITH ITS SIDE, "Payable" or "Advance" (OwedFigure): a
 * payment ahead of the next delivery leaves the supplier owing the pump, and a
 * minus sign in front of "Rs" reads as a typo.
 */
export default function SuppliersView({ suppliers }) {
  const active = suppliers.filter((supplier) => supplier.is_active);
  const retired = suppliers.filter((supplier) => !supplier.is_active);

  const owed = sumMoney(active.map((supplier) => Math.max(0, Number(supplier.balance))));
  const owingTo = active.filter((supplier) => Number(supplier.balance) > 0).length;
  const paid = sumMoney(suppliers.map((supplier) => supplier.paid));

  return (
    <>
      <TitleHeader
        title="Suppliers"
        icon="suppliers"
        tone="held"
        description="Who the pump buys fuel and lubricants from, and what it owes each one."
      />

      <section aria-label="Suppliers at a glance" className="mt-5">
        <KpiGrid columns={3}>
          <KpiCard
            label="Payable to suppliers"
            icon="moneyOut"
            tone="credit"
            value={formatPKR(owed)}
            sub={owingTo === 0 ? 'Nothing payable right now' : `To ${owingTo} supplier${owingTo === 1 ? '' : 's'}`}
          />
          <KpiCard
            label="Suppliers on the list"
            icon="suppliers"
            tone="held"
            value={String(active.length)}
            sub={retired.length > 0 ? `${retired.length} retired` : 'None retired'}
          />
          <KpiCard
            label="Paid to suppliers"
            icon="cash"
            tone="money"
            value={formatPKR(paid)}
            sub="In cash and by bank, since records began"
          />
        </KpiGrid>
      </section>

      {suppliers.length === 0 ? (
        <div className="mt-5">
          <EmptyState
            icon="suppliers"
            title="No suppliers yet"
            description="Add the companies the pump buys fuel and lubricants from. A delivery chosen against one on the Purchases page is added to its account by itself."
          >
            <SupplierForm variant="primary" />
          </EmptyState>
        </div>
      ) : (
        <>
          <section aria-labelledby="suppliers-heading" data-card className="panel mt-5 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-200 px-5 py-4">
              <h2 id="suppliers-heading" className="text-lg font-bold text-ink-900">
                All suppliers <span className="tabular font-semibold text-ink-600">({active.length})</span>
              </h2>
              <SupplierForm variant="primary" />
            </div>
            <SupplierTable suppliers={active} />
          </section>

          {retired.length > 0 ? (
            <section aria-labelledby="retired-heading" data-card className="panel mt-5 overflow-hidden">
              <div className="border-b border-ink-200 px-5 py-4">
                <h2 id="retired-heading" className="text-lg font-bold text-ink-900">
                  Retired <span className="tabular font-semibold text-ink-600">({retired.length})</span>
                </h2>
                <p className="mt-1 text-base text-ink-600">
                  Off the purchase forms. Their accounts are kept, and each can be brought back.
                </p>
              </div>
              <SupplierTable suppliers={retired} muted />
            </section>
          ) : null}
        </>
      )}
    </>
  );
}

function SupplierTable({ suppliers, muted = false }) {
  return (
    <div className="table-scroll mx-0 px-0">
      <table className="w-full min-w-[46rem]">
        <thead>
          <tr className="divide-x divide-ink-200">
            <th className="th pl-5">Supplier</th>
            <th className="th">Phone</th>
            <th className="th whitespace-nowrap text-right">Purchases</th>
            <th className="th whitespace-nowrap text-right">Payments</th>
            <th className="th whitespace-nowrap pr-5 text-right">Balance</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-200">
          {suppliers.map((supplier) => (
            <tr key={supplier.id} className="divide-x divide-ink-200 hover:bg-ink-50">
              <td className="td pl-5">
                <Link
                  href={`/admin/suppliers/${supplier.id}`}
                  className={`block font-semibold underline-offset-2 hover:underline ${
                    muted ? 'text-ink-700' : 'text-brand-700'
                  }`}
                >
                  {supplier.name}
                </Link>
                {supplier.last_delivery ? (
                  <span className="block text-sm text-ink-600">
                    Last delivery {formatDate(supplier.last_delivery)}
                  </span>
                ) : (
                  <span className="block text-sm text-ink-600">No deliveries yet</span>
                )}
              </td>
              <td className="td whitespace-nowrap">
                {supplier.phone ? (
                  <a
                    href={`tel:${String(supplier.phone).replace(/\s+/g, '')}`}
                    className="tabular font-medium text-ink-800 hover:text-brand-700 hover:underline"
                  >
                    {supplier.phone}
                  </a>
                ) : null}
              </td>
              <td className="td-num">{formatPKR(supplier.bought)}</td>
              <td className="td-num text-brand-700">{formatPKR(supplier.paid)}</td>
              <td className="td-num pr-5 font-bold text-ink-900">
                <OwedFigure value={supplier.balance} className="whitespace-nowrap" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
