import EmptyState from '@/app/_components/ui/EmptyState';
import FuelBadge from '@/app/_components/ui/FuelBadge';
import Pager from '@/app/_components/ui/Pager';
import PurchaseForm from '@/app/_components/admin/PurchaseForm';
import LubricantPurchaseForm from '@/app/_components/admin/LubricantPurchaseForm';
import PaymentStatusToggle from '@/app/_components/admin/PaymentStatusToggle';
import DeletePurchaseButton from '@/app/_components/admin/DeletePurchaseButton';
import TitleHeader from '@/app/_components/admin/dashboard/TitleHeader';
import Notice from '@/app/_components/admin/dashboard/Notice';

import { formatDate } from '@/app/_lib/date-helpers';
import {
  formatLitres,
  formatPKR,
  formatRate,
  nonBreakingHyphens,
  sumMoney,
} from '@/app/_lib/format-helpers';

const PER_PAGE = 25;

/**
 * The Purchases page, drawn - in the new look (docs/UI_CONVENTIONS.md -> "The
 * new look").
 *
 * Everything the pump buys in, in one list. Fuel and lubricants are two
 * different deliveries from two different suppliers, but they are the same
 * question at the end of the month - what went out on stock, and how much of
 * it is still owed - so they share one table rather than sitting in two that
 * have to be added up by eye. The Item column carries the tank for fuel and the
 * product for a lubricant; the badge beside it is what tells the two apart at a
 * glance.
 */
export default function PurchasesView({
  page,
  tanks,
  fuelPurchases,
  lubricantPurchases,
  lubricants,
  suppliers = [],
  isOwner,
}) {
  // The shelf and the shed buy from different people and get their own button.
  const packedLubricants = lubricants.filter((row) => !row.sold_loose);
  const looseDrums = lubricants.filter((row) => row.sold_loose);

  // One shape for both, so the table below does not have to keep asking which
  // kind of row it is looking at. `kind` travels with the row because the
  // payment toggle and the delete button need to know which table to write to.
  const rows = [
    ...fuelPurchases.map((purchase) => ({
      id: purchase.id,
      kind: 'fuel',
      date: purchase.purchase_date,
      item: purchase.tank?.name ?? 'Tank',
      badge: purchase.tank?.fuel_type,
      supplier: purchase.supplier_name,
      invoice: purchase.invoice_number,
      litres: purchase.quantity_litres,
      rate: purchase.rate,
      cost: purchase.total_cost,
      paymentStatus: purchase.payment_status,
      createdAt: purchase.created_at,
    })),
    ...lubricantPurchases.map((purchase) => ({
      id: purchase.id,
      kind: 'lubricant',
      date: purchase.purchase_date,
      item: purchase.lubricant?.name ?? 'Lubricant',
      badge: 'lubricant',
      supplier: purchase.supplier_name,
      invoice: purchase.invoice_number,
      litres: purchase.quantity_litres,
      rate: purchase.rate,
      cost: purchase.total_cost,
      paymentStatus: purchase.payment_status,
      createdAt: purchase.created_at,
    })),
  ].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.createdAt < b.createdAt ? 1 : -1;
  });

  /*
   * Sliced here rather than paged in the database, because both figures below
   * are worked out from EVERY row - what is still owed to suppliers, and what
   * the lubricant shelf has cost. A database page would make each of them a
   * total of whatever happened to be on screen. Deliveries are a few a week, so
   * the whole set is small; see getPurchases for when that stops being true.
   *
   * The two tables also cannot be paged in Postgres without a union view, since
   * a page of this list can hold rows from either.
   */
  const pageRows = rows.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  // Added in whole paisa (sumMoney), not as doubles: these were a running
  // `total + Number(cost)`, which can land a paisa off the rows it adds up.
  const unpaid = rows.filter((row) => row.paymentStatus === 'pending');
  const pendingTotal = sumMoney(unpaid.map((row) => row.cost));
  const lubricantSpend = sumMoney(lubricantPurchases.map((purchase) => purchase.total_cost));

  return (
    <>
      <TitleHeader
        title="Purchases"
        icon="purchases"
        tone="neutral"
        description="Everything bought in: fuel into the tanks, lubricants onto the shelf, a drum of loose oil into the shed. Recording one adds it to stock."
      >
        {/* All behind dialogs rather than sitting open on the page: a delivery
            is logged once a day at most, and the table below already needs the
            page's full width - see the comment on PurchaseForm itself.

            A drum gets its own button rather than being one more option in the
            lubricant dropdown. It arrives from a different supplier with no
            brand on it, and the form asks slightly different questions - so
            splitting it here is what lets each form say the right thing rather
            than hedging between the two. The button appears only once a drum
            exists to buy for. */}
        <PurchaseForm tanks={tanks} suppliers={suppliers} />
        <LubricantPurchaseForm lubricants={packedLubricants} suppliers={suppliers} />
        {looseDrums.length > 0 ? (
          <LubricantPurchaseForm lubricants={looseDrums} suppliers={suppliers} kind="loose" />
        ) : null}
      </TitleHeader>

      {isOwner && pendingTotal > 0 ? (
        <Notice tone="warn" icon="moneyOut" className="mt-5">
          <span className="whitespace-nowrap font-semibold">{formatPKR(pendingTotal)}</span> is
          still owed to suppliers, across {unpaid.length} unpaid{' '}
          {unpaid.length === 1 ? 'delivery' : 'deliveries'}.
        </Notice>
      ) : null}

      {lubricants.length === 0 && lubricantPurchases.length === 0 ? (
        <Notice tone="info" className="mt-5">
          No lubricants have been set up yet, so only fuel can be recorded here. Add the brands the
          pump stocks under Lubricants and they will appear in this list too.
        </Notice>
      ) : null}

      <section aria-label="Deliveries" className="mt-5">
        {rows.length === 0 ? (
          <EmptyState
            icon="purchases"
            title="Nothing bought in yet"
            description="Record a delivery and it will show up here, and be added to the tank or the shelf it went into."
          />
        ) : (
          <>
            <div data-card className="panel overflow-hidden">
              {/* SEVEN COLUMNS, NOT EIGHT: the rate is a line under its cost
                  rather than a column of its own. With eight, the two text
                  columns - the item and the supplier - shared what was left
                  after six that never wrap, and at 1152px that was about
                  360px: supplier names three lines deep and invoice numbers
                  broken in half, the regression CHANGELOG.md -> "Purchases
                  page" records rejecting once already. The rate is arithmetic
                  on the two figures beside it and is read with the cost, so
                  it sits under the cost. Below the width it needs, the table
                  scrolls inside its panel rather than squeezing - the
                  trade-off that entry settled on.

                  `mx-0 px-0`: inside a panel the table scrolls within it
                  rather than bleeding to the screen edge (UI_CONVENTIONS.md ->
                  "Tables in the new look"). */}
              <div className="table-scroll mx-0 px-0">
                <table className="w-full min-w-[60rem]">
                  <thead>
                    <tr>
                      <th className="th pl-5">Date</th>
                      {/* 18rem where the table scrolls anyway (below 1024px), so a
                          long lubricant name wraps to three lines instead of
                          five; 15rem from there up, where it has to fit
                          1092px beside a pinned sidebar. */}
                      <th className="th min-w-[18rem] lg:min-w-[15rem]">Item</th>
                      <th className="th min-w-[12rem]">Supplier</th>
                      <th className="th text-right">Litres</th>
                      <th className="th text-right">Cost</th>
                      <th className={`th ${isOwner ? '' : 'pr-5'}`}>Payment</th>
                      {/* A real cell with its words hidden, not a hidden cell:
                          `sr-only` on the <th> itself takes it out of the
                          table's layout, and the heading band stopped short
                          of the column of trash buttons under it. */}
                      {isOwner ? (
                        <th className="th pr-5">
                          <span className="sr-only">Actions</span>
                        </th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {pageRows.map((row) => (
                      <tr key={`${row.kind}-${row.id}`}>
                        <td className="td whitespace-nowrap pl-5 font-semibold text-ink-900">
                          {formatDate(row.date)}
                        </td>
                        {/* Badge and name on ONE line. The name sat under the
                            badge at first, which made every lubricant row
                            taller than the fuel rows either side of it and left
                            the brand looking like a footnote to its own
                            purchase - when the brand is the only thing telling
                            one product from another. */}
                        <td className="td">
                          <span className="flex items-center gap-2">
                            <FuelBadge fuelType={row.badge} />
                            {row.kind === 'lubricant' ? (
                              <span className="font-medium text-ink-900">
                                {nonBreakingHyphens(row.item)}
                              </span>
                            ) : null}
                          </span>
                        </td>
                        <td className="td">
                          <span className="font-medium text-ink-900">{row.supplier}</span>
                          {/* nowrap: "PSO-LHR-48211" broken after its first
                              hyphen reads as two references. */}
                          {row.invoice ? (
                            <span className="block whitespace-nowrap text-sm text-ink-600">
                              #{row.invoice}
                            </span>
                          ) : null}
                        </td>
                        <td className="td-num">{formatLitres(row.litres)}</td>
                        <td className="td-num">
                          <span className="font-bold text-ink-900">{formatPKR(row.cost)}</span>
                          <span className="block text-sm font-normal text-ink-600">
                            {formatRate(row.rate)} / L
                          </span>
                        </td>
                        <td className={`td ${isOwner ? '' : 'pr-5'}`}>
                          {isOwner ? (
                            <PaymentStatusToggle
                              purchaseId={row.id}
                              status={row.paymentStatus}
                              kind={row.kind}
                            />
                          ) : (
                            <span
                              className={`badge ${
                                row.paymentStatus === 'paid'
                                  ? 'bg-brand-100 text-brand-800'
                                  : 'bg-amber-100 text-amber-900'
                              }`}
                            >
                              {row.paymentStatus === 'paid' ? 'Paid' : 'Pending'}
                            </span>
                          )}
                        </td>
                        {isOwner ? (
                          <td className="td pr-5">
                            <DeletePurchaseButton
                              purchaseId={row.id}
                              kind={row.kind}
                              summary={`${formatLitres(row.litres)} of ${row.item} on ${formatDate(
                                row.date,
                              )}`}
                            />
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <Pager
              page={page}
              perPage={PER_PAGE}
              total={rows.length}
              hrefFor={(n) => `/admin/purchases?page=${n}`}
              label="Purchase pages"
            />

            {isOwner && lubricantSpend > 0 ? (
              <p className="mt-3 text-base text-ink-700">
                Of the list above,{' '}
                <span className="whitespace-nowrap font-semibold text-ink-900">
                  {formatPKR(lubricantSpend)}
                </span>{' '}
                is lubricant stock.
              </p>
            ) : null}
          </>
        )}
      </section>
    </>
  );
}
