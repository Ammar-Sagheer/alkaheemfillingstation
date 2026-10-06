import Button from '@/app/_components/ui/Button';
import DownloadNotice from '@/app/_components/ui/DownloadNotice';
import EmptyState from '@/app/_components/ui/EmptyState';
import FuelBadge from '@/app/_components/ui/FuelBadge';
import Icon from '@/app/_components/ui/Icon';
import PendingLink from '@/app/_components/ui/PendingLink';
import DailySalesTable from '@/app/_components/admin/DailySalesTable';
import DailyTableDialog from '@/app/_components/admin/DailyTableDialog';
import TitleHeader from '@/app/_components/admin/dashboard/TitleHeader';
import SectionHeader from '@/app/_components/admin/dashboard/SectionHeader';
import KpiCard, { KpiGrid } from '@/app/_components/admin/dashboard/KpiCard';
import Notice from '@/app/_components/admin/dashboard/Notice';
import MonthEndStock from '@/app/_components/admin/dashboard/MonthEndStock';
import { FuelSalesChart, CashAgainstCreditChart } from '@/app/_components/admin/dashboard/TrendCharts';

import { formatDate, formatMonth } from '@/app/_lib/date-helpers';
import {
  formatLitres,
  formatLitresFine,
  formatPKR,
  nonBreakingHyphens,
  sumMoney,
} from '@/app/_lib/format-helpers';

// The mark on the drum's row: neutral, not amber - see LubricantsView.
const LOOSE_BADGE = 'badge bg-white text-ink-800 ring-1 ring-inset ring-ink-300';

/**
 * The month's report, drawn - in the new look (docs/UI_CONVENTIONS.md -> "The
 * new look"): performance, costs and profit, for the month in the box.
 *
 * Everything on it follows the month box: the charts and the day-by-day table
 * used to show a rolling 30 days whatever month was chosen, and disagreed with
 * the Excel download, which was always month-based.
 */
export default function ReportsView({
  monthParam,
  year,
  month,
  report,
  trend,
  monthEndStock = null,
  today = null,
  exportError,
}) {
  /*
   * A MONTH STILL RUNNING HAS NO CLOSING STOCK. Nothing is entered past today,
   * so every "closing" figure for it is the stock as it stands now (reported
   * on 1 Oct 2026, when October's page said "close of 31 Oct 2026" over the
   * morning's stock). The figures are right; the words have to say "so far".
   */
  const monthOpen = Boolean(today && report.to && report.to > today);
  const monthName = formatMonth(year, month);

  const sales = report.sales ?? {};
  const purchases = report.purchases ?? {};
  const lubricantSales = report.lubricant_sales ?? {};
  const lubricantPurchases = report.lubricant_purchases ?? {};
  const lubricantsByProduct = report.lubricants_by_product ?? [];
  const profit = Number(report.profit ?? 0);

  // Fuel and lubricants, added up in the database. The cards report the
  // business; the sections under them show each trade on its own.
  const totalSales = Number(report.total_sales ?? 0);
  const totalStockCost = Number(report.total_stock_cost ?? 0);

  /*
   * The three figures profit is made of (migration 049): the cost of stock
   * SOLD - opening stock plus what was bought less closing stock - so a
   * delivery still in the tank on the last of the month is not charged against
   * the month that bought it.
   */
  const costOfStockSold = Number(report.cost_of_goods_sold ?? 0);
  const openingStock = Number(report.opening_stock_value ?? 0);
  const closingStock = Number(report.closing_stock_value ?? 0);

  // Fuel's half and oil's half, added in whole paisa (sumMoney): these were
  // double additions of two money figures.
  const totalCash = sumMoney([sales.cash_amount, lubricantSales.cash_amount]);
  const totalCredit = sumMoney([sales.credit_amount, lubricantSales.credit_amount]);
  const totalPending = sumMoney([purchases.pending_amount, lubricantPurchases.pending_amount]);
  const lubricantAmount = Number(lubricantSales.amount ?? 0);

  return (
    <>
      <TitleHeader
        title="Reports"
        icon="reports"
        tone="money"
        description="Performance, costs and profit, one month at a time."
      >
        {/* A plain GET form: picking a month is a navigation. */}
        <form method="GET" action="/admin/reports" className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="month">
            Month
          </label>
          <input
            id="month"
            type="month"
            name="month"
            defaultValue={monthParam}
            className="input w-auto py-2"
          />
          <Button variant="secondary" type="submit">
            Show
          </Button>
        </form>

        {/* The register takes a run of days within a month, so it carries this
            page's month across and picks its own days from there. */}
        <Button variant="secondary" href={`/admin/reports/register?month=${monthParam}`} pending>
          Sale &amp; stock register
        </Button>

        {/* A plain link, not a fetch: the browser handles the download itself.
            Deliberately NO `download` attribute - it forces the browser to save
            whatever the URL returns, a redirect target included, so a failed
            export landed in Downloads as a junk file instead of showing why. */}
        <Button component="a" variant="primary" href={`/admin/reports/export?month=${monthParam}`}>
          Download Excel
        </Button>
      </TitleHeader>

      {/* Self-clearing: a download that works does not re-render the page, so
          a reason left in the query string would outlive the problem. */}
      {exportError ? (
        <DownloadNotice param="export_error" className="mt-5">
          The Excel download did not work: {exportError}
        </DownloadNotice>
      ) : null}

      {/* ================= the month's headline ================= */}
      <section aria-labelledby="month-heading" className="@container mt-10">
        <SectionHeader
          id="month-heading"
          icon="date"
          tone="money"
          title={monthName}
          description={`${formatDate(report.from)} to ${formatDate(report.to)}`}
        />

        <KpiGrid>
          <KpiCard
            label="Sales"
            icon="sales"
            tone="money"
            value={formatPKR(totalSales)}
            sub={
              lubricantAmount > 0 ? (
                <>
                  <span className="whitespace-nowrap">{formatPKR(sales.sale_amount)}</span> fuel ·{' '}
                  <span className="whitespace-nowrap">{formatPKR(lubricantAmount)}</span> lubricants
                </>
              ) : (
                formatLitres(sales.litres_sold)
              )
            }
          />
          <KpiCard
            label="Stock bought"
            icon="purchases"
            tone="neutral"
            value={formatPKR(totalStockCost)}
            sub={
              Number(lubricantPurchases.total_cost ?? 0) > 0 ? (
                <>
                  <span className="whitespace-nowrap">{formatPKR(purchases.total_cost)}</span> fuel ·{' '}
                  <span className="whitespace-nowrap">
                    {formatPKR(lubricantPurchases.total_cost)}
                  </span>{' '}
                  lubricants
                </>
              ) : (
                formatLitres(purchases.quantity_litres)
              )
            }
          />
          {/* The total only: recording an expense and the breakdown by
              category live on Expenses, so the card carries the way there. */}
          <KpiCard
            label="Expenses"
            icon="expenses"
            tone="neutral"
            value={formatPKR(report.expenses_total)}
            sub={
              <PendingLink
                href={`/admin/expenses?month=${monthParam}`}
                className="font-semibold text-brand-700 underline-offset-2 hover:underline"
              >
                See or add expenses
              </PendingLink>
            }
          />
          <KpiCard
            label="Profit"
            icon="profit"
            tone="money"
            value={formatPKR(profit)}
            sub="Sales, less the cost of stock sold, less expenses"
            alert={profit < 0 ? 'A loss for the month' : null}
          />
        </KpiGrid>

        {/* THE WORKING, NOT A WARNING: how the profit figure was reached, read
            once when someone asks "how did it get to that?". Every figure is
            nowrap and every gap around one an explicit {' '} - at 400px "Rs"
            once ended one line with "14,354,223" starting the next, and one of
            four JSX-whitespace gaps once came out missing. */}
        <Notice tone="info" title="How profit is worked out" className="mt-4">
          Profit counts the stock actually <span className="font-semibold">sold</span>:{' '}
          <span className="whitespace-nowrap">{formatPKR(openingStock)}</span>{' '}
          in the tanks at the start, plus{' '}
          <span className="whitespace-nowrap">{formatPKR(totalStockCost)}</span>{' '}
          bought, less{' '}
          <span className="whitespace-nowrap">{formatPKR(closingStock)}</span>{' '}
          {monthOpen ? 'still there now' : 'still there at the end'}, which comes to{' '}
          <span className="whitespace-nowrap font-semibold">{formatPKR(costOfStockSold)}</span>. A
          delivery sitting in the tank on the last of the month is not charged against it.
        </Notice>

        <div className="mt-5">
          <KpiGrid columns={3}>
            <KpiCard label="Cash taken" icon="cash" tone="money" value={formatPKR(totalCash)} />
            <KpiCard
              label="Given on credit"
              icon="credit"
              tone="credit"
              value={formatPKR(totalCredit)}
            />
            <KpiCard
              label="Owed to suppliers"
              icon="moneyOut"
              tone="neutral"
              value={formatPKR(totalPending)}
              alert={totalPending > 0 ? 'Deliveries not yet paid for' : null}
              sub={totalPending > 0 ? null : 'Every delivery is paid for'}
            />
          </KpiGrid>
        </div>
      </section>

      {/* ================= lubricants ================= */}
      <section aria-labelledby="lubricants-heading" className="@container mt-12">
        <SectionHeader
          id="lubricants-heading"
          icon="lubricants"
          tone="oil"
          title="Lubricants"
          description={`Sold and restocked in ${monthName}, and what was left at the end of it.`}
        />

        {lubricantsByProduct.length === 0 ? (
          <EmptyState
            icon="lubricants"
            title="No lubricants were bought or sold in this month"
          />
        ) : (
          <>
            <KpiGrid>
              <KpiCard
                label="Sold"
                icon="lubricants"
                tone="oil"
                value={formatPKR(lubricantAmount)}
                sub={
                  <>
                    <span className="whitespace-nowrap">{formatLitres(lubricantSales.litres)}</span>{' '}
                    over {Number(lubricantSales.sales_count ?? 0)} sales
                    {/* The drum called out on its own: a large share of the
                        SALE COUNT and a small share of the money, so folded
                        into one figure it makes both look wrong. */}
                    {Number(lubricantSales.loose_count ?? 0) > 0 ? (
                      <>
                        , of which loose oil{' '}
                        <span className="whitespace-nowrap font-semibold text-ink-800">
                          {formatPKR(lubricantSales.loose_amount)}
                        </span>{' '}
                        over {Number(lubricantSales.loose_count)}
                      </>
                    ) : null}
                  </>
                }
              />
              <KpiCard
                label="Cash"
                icon="cash"
                tone="money"
                value={formatPKR(lubricantSales.cash_amount)}
              />
              <KpiCard
                label="On credit"
                icon="credit"
                tone="credit"
                value={formatPKR(lubricantSales.credit_amount)}
              />
              <KpiCard
                label="Stock bought"
                icon="purchases"
                tone="neutral"
                value={formatPKR(lubricantPurchases.total_cost)}
                sub={formatLitres(lubricantPurchases.quantity_litres)}
              />
            </KpiGrid>

            <div data-card className="panel mt-5 overflow-hidden">
              <div className="table-scroll mx-0 px-0">
                <table className="w-full min-w-[48rem]">
                  <thead>
                    <tr>
                      <th className="th pl-5">Lubricant</th>
                      <th className="th text-right">Litres sold</th>
                      <th className="th text-right">Sales</th>
                      <th className="th text-right">Cash</th>
                      <th className="th text-right">Credit</th>
                      <th className="th text-right">Restocked</th>
                      <th className="th pr-5 text-right">Left at month end</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {lubricantsByProduct.map((product) => (
                      <tr key={product.lubricant_id}>
                        <td className="td pl-5">
                          <span className="font-semibold text-ink-900">
                            {nonBreakingHyphens(product.name)}
                          </span>
                          {product.sold_loose ? (
                            <span className={`${LOOSE_BADGE} ms-2`}>Loose</span>
                          ) : null}
                        </td>
                        <td className="td-num">
                          {product.sold_loose
                            ? formatLitresFine(product.litres_sold)
                            : formatLitres(product.litres_sold)}
                        </td>
                        <td className="td-num font-semibold text-ink-900">
                          {formatPKR(product.amount)}
                        </td>
                        <td className="td-num">{formatPKR(product.cash_amount)}</td>
                        <td className="td-num">{formatPKR(product.credit_amount)}</td>
                        {/* Litres over money, two lines: side by side they
                            made a 175px column, and beside a pinned sidebar at
                            1152 the product's name was left 131px to wrap in. */}
                        <td className="td-num text-ink-700">
                          {Number(product.bought_litres) > 0 ? (
                            <>
                              <span className="block">{formatLitres(product.bought_litres)}</span>
                              <span className="block text-sm text-ink-600">
                                {formatPKR(product.bought_cost)}
                              </span>
                            </>
                          ) : (
                            <span className="text-ink-600">None</span>
                          )}
                        </td>
                        <td className="td-num pr-5 font-bold text-ink-900">
                          {product.sold_loose
                            ? formatLitresFine(product.closing_litres)
                            : formatLitres(product.closing_litres)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </section>

      {/* ================= stock value, opening and closing =================
          The two stock figures the profit is built on, per fuel, with the rate
          each is carried at and the pump price beside it (migration 068): the
          table an accountant's closing-stock working can be ticked against. */}
      {monthEndStock ? (
        <section aria-labelledby="stock-value-heading" className="@container mt-12">
          <SectionHeader
            id="stock-value-heading"
            icon="stock"
            tone="held"
            title="Opening and closing stock"
            description={
              monthOpen
                ? 'The stock values in the profit working above, fuel by fuel. The month is not over, so the second table is the stock as it stands today, not a closing stock.'
                : 'The stock values in the profit working above, fuel by fuel: litres, the rate each is valued at, and the pump price beside it.'
            }
          />
          {monthEndStock.error ? (
            <Notice tone="warn" title="The stock values did not load">
              {monthEndStock.error}
            </Notice>
          ) : (
            <div className="grid gap-6">
              <div>
                <h3 className="mb-2 text-base font-bold text-ink-900">
                  Opening stock{' '}
                  <span className="font-semibold text-ink-600">
                    (close of {formatDate(monthEndStock.opening_on)})
                  </span>
                </h3>
                <MonthEndStock stock={monthEndStock} side="opening" />
              </div>
              <div>
                <h3 className="mb-2 text-base font-bold text-ink-900">
                  {monthOpen ? (
                    <>
                      Stock so far{' '}
                      <span className="font-semibold text-ink-600">
                        (as entered up to {formatDate(today)}; the month closes on {formatDate(monthEndStock.to)})
                      </span>
                    </>
                  ) : (
                    <>
                      Closing stock{' '}
                      <span className="font-semibold text-ink-600">(close of {formatDate(monthEndStock.to)})</span>
                    </>
                  )}
                </h3>
                <MonthEndStock stock={monthEndStock} side="closing" asOf={monthOpen ? today : null} />
              </div>
            </div>
          )}
        </section>
      ) : null}

      {/* ================= closing stock ================= */}
      <section aria-labelledby="closing-heading" className="@container mt-12">
        <SectionHeader
          id="closing-heading"
          icon="stock"
          tone="held"
          title={monthOpen ? 'Stock so far this month' : 'Closing stock at month end'}
          description={
            monthOpen
              ? `What each tank holds as entered up to ${formatDate(today)}, and what its dips have found against the books so far. The month closes on ${formatDate(report.to)}.`
              : 'What each tank held on the last day, and what its dips found against the books over the month.'
          }
        />
        <div data-card className="panel overflow-hidden">
          <div className="table-scroll mx-0 px-0">
            <table className="w-full min-w-[34rem]">
              <thead>
                <tr>
                  <th className="th pl-5">Tank</th>
                  <th className="th">Fuel</th>
                  <th className="th text-right">{monthOpen ? 'Litres now' : 'Closing litres'}</th>
                  <th className="th pr-5 text-right">Gain / loss in month</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {(report.closing_inventory ?? []).map((tank) => {
                  const gainLoss = (report.stock_gain_loss ?? []).find(
                    (row) => row.tank_id === tank.tank_id,
                  );
                  const difference = gainLoss ? Number(gainLoss.gain_loss) : null;

                  return (
                    <tr key={tank.tank_id}>
                      <td className="td pl-5 font-semibold text-ink-900">{tank.name}</td>
                      <td className="td">
                        <FuelBadge fuelType={tank.fuel_type} />
                      </td>
                      <td className="td-num font-semibold text-ink-900">
                        {formatLitres(tank.closing_litres)}
                      </td>
                      {/* The sign is written out, so a gain and a loss differ
                          in shape as well as colour; no dip in the month says
                          so in words rather than a dash. */}
                      <td
                        className={[
                          'td-num pr-5 font-bold',
                          difference === null || difference === 0
                            ? 'font-normal text-ink-600'
                            : difference > 0
                              ? 'text-brand-700'
                              : 'text-red-700',
                        ].join(' ')}
                      >
                        {difference === null
                          ? 'No dip'
                          : `${difference > 0 ? '+' : ''}${formatLitres(difference)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ================= day by day ================= */}
      {/* The heading and the way out of the charts, on one line: the days as
          numbers used to sit UNDER the charts, which put the alternative to a
          chart below the chart it was an alternative to. */}
      <section aria-labelledby="days-heading" className="@container mt-12">
        <SectionHeader
          id="days-heading"
          icon="reports"
          tone="neutral"
          title={`${monthName} day by day`}
          description="The Dashboard's charts, for this month's days."
        >
          <DailyTableDialog
            label="Show these days as a table"
            title={`${monthName} day by day`}
            subtitle={
              <span className="text-sm text-ink-600">
                {formatDate(report.from)} to {formatDate(report.to)}
              </span>
            }
          >
            {/* Rendered on the server and handed to the dialog as children -
                DailySalesTable formats through helpers.js, which cannot cross
                into a client bundle. */}
            <DailySalesTable rows={trend} />

            <PendingLink
              href="/admin/reports/daily"
              className="inline-flex items-center gap-1.5 text-base font-semibold text-brand-700 hover:underline"
            >
              See every day, not just this month
              <Icon name="chevronRight" className="h-4 w-4" />
            </PendingLink>
          </DailyTableDialog>
        </SectionHeader>

        {/* The same two charts the Dashboard draws, from the same rows - the
            old pair (SalesTrendChart, CashCreditChart) is gone. */}
        <div className="grid gap-5 @[56rem]:grid-cols-2">
          <section data-card className="panel min-w-0 p-5">
            <FuelSalesChart data={trend} height={280} />
          </section>
          <section data-card className="panel min-w-0 p-5">
            <CashAgainstCreditChart data={trend} height={280} />
          </section>
        </div>
      </section>
    </>
  );
}
