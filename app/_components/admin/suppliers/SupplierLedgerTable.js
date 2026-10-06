import EmptyState from '@/app/_components/ui/EmptyState';
import { CancelSupplierEntryButton } from '@/app/_components/admin/suppliers/SupplierButtons';
import { formatDate } from '@/app/_lib/date-helpers';
import { formatLitres, formatPKR, formatRate } from '@/app/_lib/format-helpers';

/**
 * One page of a supplier's account, newest first, laid out the way the owner
 * described his register: the invoice, the litres, the rate per litre, what was
 * paid, and the balance after it.
 *
 * THE COLUMNS ARE A SUPPLIER STATEMENT'S: Purchases (the pump owes more),
 * Payments & credits (it owes less: a payment, a discount, a credit), Balance.
 * Not "Debit" and "Credit": on this page they point the other way from the
 * customers two pages over. An earlier "Bill" / "Paid or taken off" / "Owed
 * after" read as unclear to the owner (29 Sep 2026).
 *
 * `balance_after` and `rate` come from Postgres (067), summed and divided there,
 * never here - the same reason 064 moved the customer running balance into the
 * database.
 *
 * A CANCELLED ROW STAYS, struck through, with the word "Cancelled" beside it,
 * and keeps its place in the running balance - the customer table's rule, for
 * the customer table's reason.
 */

function whatItIs(entry) {
  if (entry.kind === 'purchase') return { label: 'Purchase', badge: 'bg-teal-100 text-teal-800' };
  if (entry.kind === 'payment') {
    return entry.paid_from === 'bank'
      ? { label: 'Payment by bank', badge: 'bg-brand-100 text-brand-800' }
      : { label: 'Payment in cash', badge: 'bg-brand-100 text-brand-800' };
  }
  if (entry.kind === 'discount') return { label: 'Discount', badge: 'bg-violet-100 text-violet-800' };
  if (entry.kind === 'adjustment') return { label: 'Adjustment', badge: 'bg-ink-100 text-ink-800' };
  return { label: 'Correction', badge: 'bg-ink-100 text-ink-700' };
}

/**
 * Which way a balance points, in the two words a supplier statement uses:
 * "Payable" (the pump owes the supplier) and "Advance" (the pump has paid
 * ahead). A minus sign in front of "Rs" reads as a typo, so it is never shown.
 */
export function balanceSide(value) {
  const n = Number(value ?? 0);
  if (n > 0) return 'Payable';
  if (n < 0) return 'Advance';
  return 'Settled';
}

/** A balance as a figure and its side, e.g. "Rs 1,915,159 Advance". */
export function OwedFigure({ value, className = '' }) {
  const n = Number(value ?? 0);
  const side = balanceSide(n);
  return (
    <span className={className}>
      {formatPKR(Math.abs(n))}
      <span
        className={`ms-1.5 text-sm font-semibold ${
          n > 0 ? 'text-red-700' : n < 0 ? 'text-brand-700' : 'text-ink-600'
        }`}
      >
        {side}
      </span>
    </span>
  );
}

export default function SupplierLedgerTable({ entries, correctedIds = [], supplierId, canCancel = false }) {
  if (entries.length === 0) {
    return (
      <EmptyState
        icon="list"
        title="Nothing on this account yet"
        description="A delivery recorded on Purchases against this supplier appears here by itself. Payments, discounts and an opening balance are added with the buttons above."
      />
    );
  }

  const cancelled = new Set(correctedIds);

  return (
    <div data-card className="panel overflow-hidden">
      <div className="table-scroll mx-0 px-0">
        <table className="w-full min-w-[46rem]">
          <thead>
            <tr>
              <th className="th pl-5">Date</th>
              <th className="th min-w-[14rem] lg:min-w-0">Details</th>
              <th className="th whitespace-nowrap text-right">Purchases</th>
              <th className="th whitespace-nowrap text-right">Payments &amp; credits</th>
              <th className={`th whitespace-nowrap text-right ${canCancel ? '' : 'pr-5'}`}>Balance</th>
              {canCancel ? (
                <th className="th pr-5 text-right">
                  <span className="sr-only">Cancel</span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {entries.map((entry) => {
              const owesMore = entry.direction === 'owe_more';
              const isCancelled = cancelled.has(entry.id);
              const isReversal = entry.kind === 'reversal';
              const kind = whatItIs(entry);
              const cancellable =
                canCancel && !isCancelled && !isReversal && entry.kind !== 'purchase';

              return (
                <tr key={entry.id} className={isCancelled ? 'bg-ink-50/60 text-ink-600' : undefined}>
                  <td className="td whitespace-nowrap pl-5 font-semibold">{formatDate(entry.entry_date)}</td>
                  <td className="td">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`badge ${kind.badge}`}>{kind.label}</span>
                      {entry.note ? (
                        <span className={isCancelled ? 'line-through' : undefined}>{entry.note}</span>
                      ) : null}
                      {isCancelled ? (
                        <span className="badge bg-amber-100 text-amber-900" title="Cancelled by a later entry">
                          Cancelled
                        </span>
                      ) : null}
                      {entry.is_auto ? (
                        <span
                          className="badge bg-ink-100 text-ink-700"
                          title="Posted by the delivery on the Purchases page"
                        >
                          Auto
                        </span>
                      ) : null}
                    </div>
                    {/* The register's own columns, under the detail rather than
                        three more columns: they belong to deliveries only, and
                        three columns blank on every payment row would push the
                        figures that matter off a tablet's width. */}
                    {entry.kind === 'purchase' || (isReversal && entry.litres) ? (
                      <span className="tabular mt-0.5 block text-sm text-ink-700">
                        {[
                          entry.invoice_number ? `Invoice ${entry.invoice_number}` : null,
                          entry.litres ? formatLitres(entry.litres) : null,
                          entry.rate ? `at ${formatRate(entry.rate)} a litre` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    ) : null}
                    {entry.kind === 'payment' && entry.bank_label ? (
                      <span className="mt-0.5 block text-sm text-ink-700">From {entry.bank_label}</span>
                    ) : null}
                  </td>
                  <td className={`td-num ${isCancelled ? 'text-ink-600 line-through' : 'text-red-700'}`}>
                    {owesMore ? formatPKR(entry.amount) : null}
                  </td>
                  <td className={`td-num ${isCancelled ? 'text-ink-600 line-through' : 'text-brand-700'}`}>
                    {owesMore ? null : formatPKR(entry.amount)}
                  </td>
                  <td
                    className={`td-num font-bold ${isCancelled ? 'text-ink-600' : 'text-ink-900'} ${
                      canCancel ? '' : 'pr-5'
                    }`}
                  >
                    <OwedFigure value={entry.balance_after} className="whitespace-nowrap" />
                  </td>
                  {canCancel ? (
                    <td className="td pr-5 text-right">
                      {cancellable ? <CancelSupplierEntryButton entry={entry} supplierId={supplierId} /> : null}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
