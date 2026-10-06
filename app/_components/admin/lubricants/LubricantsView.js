import EmptyState from '@/app/_components/ui/EmptyState';
import PendingLink from '@/app/_components/ui/PendingLink';
import Pager from '@/app/_components/ui/Pager';
import LubricantSaleForm from '@/app/_components/admin/LubricantSaleForm';
import LooseOilSaleForm from '@/app/_components/admin/LooseOilSaleForm';
import LubricantManager from '@/app/_components/admin/LubricantManager';
import DeleteLubricantSaleButton from '@/app/_components/admin/DeleteLubricantSaleButton';
import DayHeader from '@/app/_components/admin/dashboard/DayHeader';
import SectionHeader from '@/app/_components/admin/dashboard/SectionHeader';
import KpiCard, { KpiGrid } from '@/app/_components/admin/dashboard/KpiCard';
import Notice from '@/app/_components/admin/dashboard/Notice';

import { formatDate } from '@/app/_lib/date-helpers';
import {
  formatLitres,
  formatLitresFine,
  formatPKR,
  formatRate,
  nonBreakingHyphens,
  sumMoney,
} from '@/app/_lib/format-helpers';

/*
 * A day, not a history - so this is bounded by how much can be sold in one day
 * rather than growing forever. It is paged anyway: a busy Saturday can run to
 * dozens of sales, and the shelf table below them is the thing that then
 * becomes unreachable. Sliced from the day already fetched, because the RPC
 * returns the whole day in one round trip and the totals above are worked out
 * from all of it.
 */
const PER_PAGE = 20;

/*
 * The mark on a pour out of the drum, in the sales table and on the shelf.
 * NEUTRAL, where it used to be amber: amber is the app's colour for a warning
 * or for money owed, and "sold loose" is neither - it is a kind of sale. The
 * word carries it.
 */
const LOOSE_BADGE = 'badge bg-white text-ink-800 ring-1 ring-inset ring-ink-300';

/**
 * The lubricant counter, drawn - in the new look (docs/UI_CONVENTIONS.md ->
 * "The new look"): what was sold on the day, and what is left to sell.
 *
 * Its own section rather than a corner of Readings, because the two are
 * recorded in completely different ways. A day of fuel is worked out once, from
 * six meters. Oil is sold one tin at a time all day, so each sale is its own
 * row - which is also what makes a customer's credit slip for a carton land on
 * the same ledger as their diesel.
 *
 * Everything on the page follows the date in the header, the same as Readings
 * and Stock, so yesterday can be finished off this morning.
 *
 * ONE PAGE FOR BOTH KINDS OF OIL SALE, WHICH REVERSES AN EARLIER DECISION. The
 * drum used to have a page of its own (docs/CHANGELOG.md): a long run of
 * rupee-priced pours buried the four carton sales that actually need reading.
 * Splitting by route meant knowing which page a sale lived on before looking
 * for it, and a day's oil takings were never on one screen. The pours now sit
 * in the same table, marked, with a filter above it. `kind` is a query string
 * like every other filter here, so Back works through it and a filtered view
 * can be linked to.
 */
export default function LubricantsView({
  date,
  page,
  kind,
  day,
  stock,
  products,
  customers,
  isOwner,
}) {
  const totals = day.totals ?? {};

  const allSales = day.sales ?? [];
  const sales =
    kind === 'all'
      ? allSales
      : allSales.filter((sale) => Boolean(sale.sold_loose) === (kind === 'loose'));

  const sellable = stock.filter((row) => row.is_active && !row.sold_loose);
  const sellableDrums = stock.filter((row) => row.is_active && row.sold_loose);
  const hasDrum = stock.some((row) => row.sold_loose);

  // The RPC gives each half separately; the day as a whole is added up here
  // rather than added to the RPC as a third set of sums that could fall out of
  // step with the other two - in whole paisa (sumMoney), not as doubles.
  const packAmount = Number(totals.pack_amount ?? 0);
  const packCount = Number(totals.pack_count ?? 0);
  const looseCount = Number(totals.loose_count ?? 0);
  const looseAmount = Number(totals.loose_amount ?? 0);

  /* The day as a whole, which is what the top of the page leads with. The
     credit figure covers both kinds on purpose: it answers "how much of the
     day's oil is not in the drawer", and that question does not care which
     container the oil came out of. */
  const dayAmount = sumMoney([packAmount, looseAmount]);
  const dayCredit = Number(totals.credit_amount ?? 0);
  const creditShare = dayAmount > 0 ? Math.round((dayCredit / dayAmount) * 100) : 0;

  const pageSales = sales.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  /* The date has to survive both controls, and the page number is dropped when
     the filter changes - staying on page 3 of a list that just became four
     rows long shows an empty table and reads as a broken filter. */
  const kindHref = (next) =>
    `/admin/lubricants?date=${date}${next === 'all' ? '' : `&kind=${next}`}`;
  const pageHref = (n) =>
    `/admin/lubricants?date=${date}${kind === 'all' ? '' : `&kind=${kind}`}&page=${n}`;

  /*
   * Packed first, the drum last. The shelf keeps both - someone counting what
   * is in the building wants one answer - but they are different things, and
   * an alphabetical sort was interleaving a drum measured in fractions of a
   * litre with cartons measured in whole ones.
   */
  const shelf = [...stock].sort(
    (a, b) => Number(a.sold_loose) - Number(b.sold_loose) || a.name.localeCompare(b.name),
  );

  return (
    <>
      {/* The day's actions ride in the day header's control row, where
          someone who has just served a customer is already looking - the
          drum's button once lived only in a card further down, which put the
          more frequent sale in the harder place to find. They are one group,
          so on a narrow screen they wrap together under the date controls
          rather than one at a time among them. */}
      <DayHeader
        date={date}
        basePath="/admin/lubricants"
        extraParams={kind === 'all' ? undefined : { kind }}
        title="Lubricants"
        icon="lubricants"
      >
        <div className="flex flex-wrap items-center gap-2">
          {isOwner ? <LubricantManager lubricants={products} /> : null}
          <LubricantSaleForm
            lubricants={sellable}
            customers={customers}
            date={date}
            dateLabel={formatDate(date)}
          />
          {sellableDrums.length > 0 ? (
            <LooseOilSaleForm
              drums={sellableDrums}
              customers={customers}
              date={date}
              dateLabel={formatDate(date)}
            />
          ) : null}
        </div>
      </DayHeader>

      {/* THE TEST IS "IS THERE ANY OIL AT ALL", not "is there anything on the
          shelf". A pump that keeps only a drum is a real setup. */}
      {stock.length === 0 ? (
        <div className="mt-5">
          <EmptyState
            icon="lubricants"
            title="No lubricants set up yet"
            description={
              isOwner
                ? 'Add the brands the pump stocks with “Manage lubricants” above: sealed packs, or a drum of loose oil. Once one is on the list it can be sold here, restocked from Purchases, and it will show up in the month’s report.'
                : 'Ask the owner to add the lubricants the pump stocks. They will appear here once they have.'
            }
          />
        </div>
      ) : (
        <>
          {/* THE WHOLE DAY FIRST, THEN THE HALVES. These were once four
              unqualified tiles counting packed sales only, with no word saying
              so; beside a shelf table that includes the drum they looked
              simply wrong. Naming both halves and their total is what makes
              the page legible. "Oil sold", not "Oil sold today": the header
              says which day, and on yesterday's page "today" was untrue. */}
          <section aria-label="Oil sales for the day" className="mt-5">
            <KpiGrid>
              <KpiCard
                label="Oil sold"
                icon="lubricants"
                tone="oil"
                value={formatPKR(dayAmount)}
                sub="Packed and loose together"
              />
              <KpiCard
                label="Packed, off the shelf"
                icon="inventory"
                tone="oil"
                value={formatPKR(packAmount)}
                sub={
                  packCount > 0 ? (
                    <>
                      {packCount} {packCount === 1 ? 'sale' : 'sales'} ·{' '}
                      <span className="whitespace-nowrap">{formatLitres(totals.pack_litres)}</span>
                    </>
                  ) : (
                    'Nothing sold yet'
                  )
                }
              />
              <KpiCard
                label="Loose, from the drum"
                icon="stock"
                tone="oil"
                value={formatPKR(looseAmount)}
                sub={
                  looseCount > 0
                    ? `${looseCount} ${looseCount === 1 ? 'pour' : 'pours'}`
                    : hasDrum
                      ? 'Nothing poured yet'
                      : 'No drum set up'
                }
              />
              <KpiCard
                label="On credit"
                icon="credit"
                tone="credit"
                value={formatPKR(dayCredit)}
                sub={dayAmount > 0 ? `${creditShare}% of the day, the rest in cash` : null}
              />
            </KpiGrid>
          </section>

          {/* ================= the day's sales ================= */}
          <section aria-labelledby="sold-heading" className="@container mt-12">
            <SectionHeader
              id="sold-heading"
              icon="sales"
              tone="oil"
              title={`Sold on ${formatDate(date)}`}
              description={
                hasDrum ? (
                  <>
                    One row per sale. Pours out of the drum are marked{' '}
                    <span className={LOOSE_BADGE}>Loose</span>.
                  </>
                ) : (
                  'One row per sale.'
                )
              }
            >
              {/* Only drawn when there is a drum to tell apart from the shelf:
                  on a pump that sells packs only, two of three choices could
                  never change anything. The Dashboard's segmented control; the
                  chosen one is a <span>, not a link, because a link styled to
                  look inert still takes focus and navigates to where you are.
                  `scroll={false}` because only the table below changes. */}
              {hasDrum ? (
                <div role="group" aria-label="Which oil sales to show" className="seg">
                  <KindChoice href={kindHref('all')} active={kind === 'all'}>
                    All oil
                  </KindChoice>
                  <KindChoice href={kindHref('packed')} active={kind === 'packed'}>
                    Packed only
                  </KindChoice>
                  <KindChoice href={kindHref('loose')} active={kind === 'loose'}>
                    Loose only
                  </KindChoice>
                </div>
              ) : null}
            </SectionHeader>

            {sales.length === 0 ? (
              <EmptyState
                icon="sales"
                title={
                  kind === 'loose'
                    ? 'Nothing poured from the drum on this date'
                    : kind === 'packed'
                      ? 'Nothing packed sold on this date'
                      : 'Nothing sold yet on this date'
                }
                description="Use the buttons at the top: “Record a lubricant sale” for a sealed carton or bottle off the shelf, “Record a loose oil sale” for a pour out of the drum."
              />
            ) : (
              <>
                <div data-card className="panel overflow-hidden">
                  <div className="table-scroll mx-0 px-0">
                    <table className="w-full min-w-[50rem]">
                      <thead>
                        <tr>
                          <th className="th pl-5">Lubricant</th>
                          <th className="th text-right">Litres</th>
                          <th className="th text-right">Rate</th>
                          <th className="th text-right">Amount</th>
                          <th className="th text-right">Cash</th>
                          <th className="th text-right">Credit</th>
                          <th className={`th ${isOwner ? '' : 'pr-5'}`}>Customer</th>
                          {isOwner ? (
                            <th className="th pr-5">
                              <span className="sr-only">Actions</span>
                            </th>
                          ) : null}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-ink-100">
                        {pageSales.map((sale) => {
                          const onCredit = Number(sale.credit_amount) > 0;
                          return (
                            <tr key={sale.id}>
                              <td className="td pl-5">
                                <span className="font-semibold text-ink-900">
                                  {nonBreakingHyphens(sale.name)}
                                </span>
                                {/* The one thing that tells the two kinds apart
                                    now they share a table; the same mark as on
                                    the shelf below. */}
                                {sale.sold_loose ? (
                                  <span className={`${LOOSE_BADGE} ms-2`}>Loose</span>
                                ) : null}
                                {sale.note ? (
                                  <span className="mt-1 block max-w-[48ch] whitespace-normal text-sm text-ink-700 [overflow-wrap:anywhere]">
                                    <span className="font-semibold text-ink-800">Note:</span>{' '}
                                    {sale.note}
                                  </span>
                                ) : null}
                              </td>
                              {/* A pour is a fraction of a litre - "0.03 L" at two
                                  decimals is most of a rupee's worth rounded away. */}
                              <td className="td-num">
                                {sale.sold_loose
                                  ? formatLitresFine(sale.litres)
                                  : formatLitres(sale.litres)}
                              </td>
                              <td className="td-num text-ink-600">
                                {formatRate(sale.rate_per_litre)}
                              </td>
                              <td className="td-num font-bold text-ink-900">
                                {formatPKR(sale.amount)}
                              </td>
                              <td className="td-num">{formatPKR(sale.cash_amount)}</td>
                              {/* A real zero when nothing was on credit, quiet
                                  so the credit figures stand out - it was a
                                  dash, and the page carries no dashes now. */}
                              <td
                                className={`td-num ${
                                  onCredit ? 'font-semibold text-ink-900' : 'font-normal text-ink-600'
                                }`}
                              >
                                {formatPKR(onCredit ? sale.credit_amount : 0)}
                              </td>
                              <td className={`td ${isOwner ? '' : 'pr-5'}`}>
                                {sale.customer_id ? (
                                  <PendingLink
                                    href={`/admin/customers/${sale.customer_id}`}
                                    className="font-semibold text-brand-700 underline-offset-2 hover:underline"
                                  >
                                    {sale.customer_name}
                                  </PendingLink>
                                ) : (
                                  <span className="text-ink-600">Cash sale</span>
                                )}
                              </td>
                              {isOwner ? (
                                <td className="td pr-5">
                                  <DeleteLubricantSaleButton
                                    saleId={sale.id}
                                    summary={`${formatLitres(sale.litres)} of ${sale.name}`}
                                  />
                                </td>
                              ) : null}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <Pager
                  page={page}
                  perPage={PER_PAGE}
                  total={sales.length}
                  hrefFor={pageHref}
                  label="Sale pages"
                />
              </>
            )}
          </section>

          {/* ================= the shelf ================= */}
          {/* THE TIMEFRAME BELONGS IN THE HEADING. Bought and Sold here are
              running totals since the pump opened, sitting under a set of
              figures for one day - which is how a shelf row reading "sold 1 L"
              once looked like it contradicted "nothing sold today". */}
          <section aria-labelledby="shelf-heading" className="@container mt-12">
            <SectionHeader
              id="shelf-heading"
              icon="inventory"
              tone="oil"
              title="On the shelf"
              description={`Everything bought and sold up to ${formatDate(date)}, not just this day. The drum is included: it is stock in the building like anything else.`}
            />

            <div data-card className="panel overflow-hidden">
              <div className="table-scroll mx-0 px-0">
                <table className="w-full min-w-[46rem]">
                  <thead>
                    <tr>
                      <th className="th pl-5">Lubricant</th>
                      <th className="th text-right">Pack</th>
                      <th className="th text-right">Selling rate</th>
                      <th className="th text-right">Bought to date</th>
                      <th className="th text-right">Sold to date</th>
                      <th className="th pr-5 text-right">In stock</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {shelf.map((row) => (
                      <ShelfRow key={row.id} row={row} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {hasDrum ? (
              <Notice tone="info" className="mt-4">
                What comes off the drum is{' '}
                <span className="font-semibold">worked out from its rate, not measured</span>. If
                the level in the yard stops matching the figure here, the rate is what to check.
              </Notice>
            ) : null}

            <p className="mt-3 text-base text-ink-700">
              Restock a lubricant from{' '}
              <PendingLink
                href="/admin/purchases"
                className="font-semibold text-brand-700 underline-offset-2 hover:underline"
              >
                Purchases
              </PendingLink>
              , where it sits alongside the fuel deliveries.
            </p>
          </section>
        </>
      )}
    </>
  );
}

/**
 * One product on the shelf, as at the date on screen.
 *
 * LOW AND OUT OF STOCK IN WORDS, not only in colour - "0 L" in red and "16 L"
 * in black are the same shape to a red-green colourblind reader in a dim
 * office. Below one whole pack there is nothing left to sell as a pack; for the
 * drum, ten litres is roughly a week. The same rule, words and order as the
 * Stock page's shelf.
 */
function ShelfRow({ row }) {
  const left = Number(row.stock_litres ?? 0);
  const lowAt = row.sold_loose ? 10 : Number(row.pack_size_litres ?? 0);
  const state = left <= 0 ? 'out' : left < lowAt ? 'low' : 'ok';
  const hasRate = Number(row.sale_rate_per_litre) > 0;

  return (
    <tr>
      <td className="td pl-5">
        <span className="font-semibold text-ink-900">{nonBreakingHyphens(row.name)}</span>
        {row.sold_loose ? <span className={`${LOOSE_BADGE} ms-2`}>Loose</span> : null}
        {row.is_active ? null : (
          <span className="badge ms-2 bg-ink-100 text-ink-700">Retired</span>
        )}
      </td>
      {/* A drum has no pack size worth printing, and its quantities are
          fractions of a litre - so it says what it is instead, and gets the
          finer formatter while the shelf keeps the plain one. */}
      <td className="td-num text-ink-600">
        {row.sold_loose ? 'By the rupee' : formatLitres(row.pack_size_litres)}
      </td>
      {/* For a drum the rate is load-bearing rather than informational: it is
          the only thing turning "Rs 20 of oil" into litres off the stock, so a
          missing one is flagged; for a pack it is a convenience. */}
      <td className="td-num">
        {hasRate ? (
          <span className="text-ink-700">{formatRate(row.sale_rate_per_litre)}</span>
        ) : row.sold_loose ? (
          <span className="badge bg-amber-100 text-amber-900">Not set</span>
        ) : (
          <span className="text-ink-600">Not set</span>
        )}
      </td>
      <td className="td-num">{formatLitres(row.purchased_litres)}</td>
      <td className="td-num">
        {row.sold_loose ? formatLitresFine(row.sold_litres) : formatLitres(row.sold_litres)}
      </td>
      <td className="td-num pr-5">
        <span className="inline-flex items-center justify-end gap-2">
          {state === 'ok' ? null : (
            <span
              className={`badge text-xs ${
                state === 'out' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-900'
              }`}
            >
              {state === 'out' ? 'Out of stock' : 'Low'}
            </span>
          )}
          <span
            className={`font-bold ${
              state === 'out' ? 'text-red-700' : state === 'low' ? 'text-amber-900' : 'text-ink-900'
            }`}
          >
            {row.sold_loose ? formatLitresFine(left) : formatLitres(left)}
          </span>
        </span>
      </td>
    </tr>
  );
}

/** One choice in the packed/loose filter: the Dashboard's `.seg` control. */
function KindChoice({ href, active, children }) {
  if (active) {
    return (
      <span aria-current="true" className="seg-item-active">
        {children}
      </span>
    );
  }
  return (
    <PendingLink href={href} scroll={false} className="seg-item">
      {children}
    </PendingLink>
  );
}
