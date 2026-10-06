import Icon from '@/app/_components/ui/Icon';
import FuelBadge from '@/app/_components/ui/FuelBadge';
import DownloadNotice from '@/app/_components/ui/DownloadNotice';
import Pager from '@/app/_components/ui/Pager';
import PaymentForm from '@/app/_components/admin/PaymentForm';
import LedgerAdjustmentForm from '@/app/_components/admin/LedgerAdjustmentForm';
import CustomerLedgerTable from '@/app/_components/admin/CustomerLedgerTable';
import EditCustomerButton from '@/app/_components/admin/EditCustomerButton';
import PrintStatementButton from '@/app/_components/admin/PrintStatementButton';
import TitleHeader from '@/app/_components/admin/dashboard/TitleHeader';
import SectionHeader from '@/app/_components/admin/dashboard/SectionHeader';
import VehiclesPanel from '@/app/_components/admin/customers/VehiclesPanel';
import FigureTile from '@/app/_components/admin/dashboard/FigureTile';
import { TILE } from '@/app/_components/admin/dashboard/tones';

import { fuelColor } from '@/app/_lib/fuel-colors';
import { formatLitres, formatPKR, sumMoney } from '@/app/_lib/format-helpers';

export const PER_PAGE = 25;

/**
 * One customer's page, drawn - in the new look (docs/UI_CONVENTIONS.md -> "The
 * new look"): what they owe, what they have taken, and every entry behind it.
 *
 * The balance and the fuel breakdown come from the statement RPC, which sums
 * over the whole ledger in Postgres - so paging the ENTRIES changes only what
 * is listed, never what is owed.
 */
export default function CustomerView({
  customer,
  statement,
  entries,
  entryCount,
  correctedIds,
  account,
  page,
  asOf,
  isOwner,
  statementError,
  vehicles = [],
  vehicleTotals = [],
}) {
  const vehicleNames = Object.fromEntries(vehicles.map((vehicle) => [vehicle.id, vehicle.vehicle_number]));
  const activeVehicles = vehicles.filter((vehicle) => vehicle.is_active).length;
  const balance = Number(statement.balance ?? 0);
  const limit = customer.credit_limit === null ? null : Number(customer.credit_limit);
  const isOverLimit = limit !== null && balance > limit;
  const fuels = statement.fuel_taken ?? [];

  return (
    <>
      <TitleHeader
        title={customer.name}
        icon="customers"
        tone="credit"
        back={{ href: '/admin/customers', label: 'Back to customers' }}
        description={
          [
            activeVehicles > 1 ? `${activeVehicles} vehicles` : customer.vehicle_number,
            customer.phone,
          ]
            .filter(Boolean)
            .join(' · ') || null
        }
      >
        {/* THE ACTIONS THAT USED TO BE A COLUMN. Recording a payment is the
            reason someone opens this page with a customer standing in front of
            them, so it is the one primary button. Printing is second: you print
            the page, you go, you come back and record what came in with the
            button beside it. "Back to customers" became the header's back link. */}
        <PaymentForm customerId={customer.id} balance={balance} />
        <PrintStatementButton
          customerId={customer.id}
          customerName={customer.name}
          balance={balance}
          account={account}
          asOf={asOf}
        />
        {isOwner ? <LedgerAdjustmentForm customerId={customer.id} balance={balance} /> : null}
        <EditCustomerButton customer={customer} />
      </TitleHeader>

      {/* A download is a plain link, so a failure has nowhere else to be
          shown - the same self-clearing notice the Reports export uses. */}
      {statementError ? (
        <DownloadNotice param="statement_error" className="mt-5">
          The statement did not download: {statementError}
        </DownloadNotice>
      ) : null}

      {/* THE TWO SUMMARIES SIDE BY SIDE, so the ledger below gets the whole
          width, and ONE HEIGHT for the pair. This was `items-start`, so that
          a customer with one fuel did not get a hand's width of empty paper
          under their only band; but two panels of different heights side by
          side read as broken too (reported 27 Sep 2026). So the pair
          stretches, and the space goes where it reads as layout rather than
          as something missing: the balance panel's two tiles drop to its
          foot, and the fuel bands grow to fill theirs. */}
      <div className="@container mt-5">
        <div className="grid gap-5 @[56rem]:grid-cols-2 [&>*]:min-w-0">
          {/* ---- balance ---- */}
          <section
            aria-labelledby="owes-heading"
            data-card
            className="panel @container flex flex-col p-5"
          >
            <h2
              id="owes-heading"
              className="flex items-center gap-3 text-base font-semibold text-ink-700"
            >
              <span className={`icon-tile h-10 w-10 ${TILE.credit}`}>
                <Icon name="credit" className="h-[22px] w-[22px]" />
              </span>
              Currently owes
            </h2>
            <p
              className={[
                'tabular mt-3 whitespace-nowrap text-3xl font-bold tracking-tight @[22rem]:text-4xl',
                balance > 0 ? (isOverLimit ? 'text-red-700' : 'text-ink-900') : 'text-brand-700',
              ].join(' ')}
            >
              {formatPKR(balance)}
            </p>

            {limit !== null ? (
              <p className={`mt-2 text-base ${isOverLimit ? 'text-red-700' : 'text-ink-700'}`}>
                Credit limit <span className="whitespace-nowrap font-semibold">{formatPKR(limit)}</span>
                {isOverLimit ? (
                  <>
                    , over by{' '}
                    <span className="whitespace-nowrap font-semibold">
                      {formatPKR(sumMoney([balance, -limit]))}
                    </span>{' '}
                    <span className="badge ms-1 bg-red-100 text-red-800">Over limit</span>
                  </>
                ) : null}
              </p>
            ) : (
              <p className="mt-2 text-base text-ink-600">No credit limit set.</p>
            )}

            <dl className="mt-auto grid grid-cols-1 gap-2 pt-4 @[36rem]:grid-cols-2 @[36rem]:gap-3">
              <FigureTile label="Fuel taken" value={formatPKR(statement.total_debits)} />
              <FigureTile label="Paid back" value={formatPKR(statement.total_credits)} />
            </dl>
          </section>

          {/* ---- lifetime fuel ---- */}
          {fuels.length > 0 ? (
            <section
              aria-labelledby="fuel-heading"
              data-card
              className="panel @container flex flex-col p-5"
            >
              <h2
                id="fuel-heading"
                className="flex items-center gap-3 text-base font-semibold text-ink-700"
              >
                <span className={`icon-tile h-10 w-10 ${TILE.held}`}>
                  <Icon name="fuelPump" className="h-[22px] w-[22px]" />
                </span>
                Fuel taken in total
              </h2>
              {/* THE COLUMN COUNT FOLLOWS THE DATA: most customers have only
                  ever bought one fuel, and a fixed two columns left them one
                  band and a hole where a diesel figure seemed about to arrive.
                  Each band is the fuel's `tint` from fuel-colors.js under ink
                  of its own, badge one side and figures the other, read as one
                  line - "Petrol ... 68.63 L, Rs 23,101". */}
              <div
                className={`mt-4 grid flex-1 auto-rows-fr gap-3 ${
                  fuels.length > 1 ? '@[30rem]:grid-cols-2' : ''
                }`}
              >
                {fuels.map((row) => (
                  <div
                    key={row.fuel_type}
                    className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-2xl p-3.5 ${
                      fuelColor(row.fuel_type).tint
                    }`}
                  >
                    <FuelBadge fuelType={row.fuel_type} />
                    <div className="text-right">
                      <p className="tabular whitespace-nowrap text-xl font-bold text-ink-900">
                        {formatLitres(row.litres)}
                      </p>
                      <p className="tabular whitespace-nowrap text-sm text-ink-700">
                        {formatPKR(row.amount)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>

      {/* ---- vehicles (801) ---- */}
      <section aria-labelledby="vehicles-heading" className="@container mt-12">
        <SectionHeader
          id="vehicles-heading"
          icon="vehicle"
          tone="credit"
          title="Vehicles"
          description="Every vehicle on this account, and what each has taken on credit. One account, one balance: each slip just says which vehicle it was."
        />
        <VehiclesPanel
          customerId={customer.id}
          vehicles={vehicles}
          totals={vehicleTotals}
          isOwner={isOwner}
        />
      </section>

      {/* ---- history ---- */}
      <section aria-labelledby="history-heading" className="@container mt-12">
        <SectionHeader
          id="history-heading"
          icon="list"
          tone="neutral"
          title="Transaction history"
          description="Fuel taken on credit reaches this ledger by itself, from the readings screen. Nothing here is ever edited or deleted: a mistake is corrected with a new entry pointing the other way, so the history always adds up."
        />

        <CustomerLedgerTable
          entries={entries}
          correctedIds={correctedIds}
          customerId={customer.id}
          balance={balance}
          canCorrect={isOwner}
          vehicleNames={vehicleNames}
        />

        <Pager
          page={page}
          perPage={PER_PAGE}
          total={entryCount}
          hrefFor={(n) => `/admin/customers/${customer.id}?page=${n}`}
          label="Ledger pages"
        />
      </section>
    </>
  );
}
