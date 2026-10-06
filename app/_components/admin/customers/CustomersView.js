import Link from 'next/link';

import EmptyState from '@/app/_components/ui/EmptyState';
import CustomerForm from '@/app/_components/admin/CustomerForm';
import CustomerSearch from '@/app/_components/admin/CustomerSearch';
import EditCustomerButton from '@/app/_components/admin/EditCustomerButton';
import RemoveCustomerButton, {
  RestoreCustomerButton,
  PurgeCustomerButton,
} from '@/app/_components/admin/RemoveCustomerButton';
import TitleHeader from '@/app/_components/admin/dashboard/TitleHeader';
import SectionHeader from '@/app/_components/admin/dashboard/SectionHeader';
import KpiCard, { KpiGrid } from '@/app/_components/admin/dashboard/KpiCard';

import { customerAvatar } from '@/app/_lib/customer-avatar';
import { formatPKR, sumMoney } from '@/app/_lib/format-helpers';

/**
 * The name cell.
 *
 * The bubble carries the customer's INITIALS - see customer-avatar.js for why
 * the icon version did not survive contact with a long list.
 *
 * ONE CELL INSTEAD OF TWO COLUMNS. The vehicle used to be a column of its own,
 * which spent a whole column's width on a field that is blank for a good share
 * of customers and is only ever read as "which of the two Ahmads is this".
 * Sitting under the name it does that job better and gives the table one fewer
 * column to fit before it starts scrolling sideways.
 */
function CustomerCell({ customer, muted = false }) {
  const avatar = customerAvatar(customer);

  return (
    <div className="flex items-center gap-3">
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
          muted ? 'bg-ink-100 text-ink-600' : `${avatar.bg} ${avatar.text}`
        }`}
        aria-hidden="true"
      >
        {avatar.initials}
      </span>
      <div className="min-w-0">
        <Link
          href={`/admin/customers/${customer.customer_id}`}
          className={`block truncate font-semibold underline-offset-2 hover:underline ${
            muted ? 'text-ink-700' : 'text-brand-700'
          }`}
        >
          {customer.name}
        </Link>
        {/* Never a dash here. A dash under a name reads as a missing value the
            reader should go and fix; a customer with no vehicle on file is
            simply a customer with no vehicle, so the line is absent instead. */}
        {customer.vehicle_number ? (
          <span className="tabular block truncate text-sm text-ink-600">
            {customer.vehicle_number}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Name, vehicle and phone, matched case-insensitively on a plain substring.
 *
 * FILTERED IN JAVASCRIPT, NOT IN POSTGRES, and that is a deliberate limit
 * rather than an oversight. `get_customer_balances` returns every active
 * account in one call because the page totals them all anyway - the figures at
 * the top are sums over the whole list, not over what is on screen. If this
 * pump ever has thousands of credit accounts, the search belongs in the RPC and
 * the totals need their own query.
 */
function matches(customer, query) {
  if (!query) return true;
  const needle = query.toLowerCase();
  return [customer.name, customer.vehicle_number, customer.phone]
    .filter(Boolean)
    .some((field) => String(field).toLowerCase().includes(needle));
}

/**
 * The Customers page, drawn - in the new look (docs/UI_CONVENTIONS.md -> "The
 * new look"): credit accounts and what each one currently owes.
 */
export default function CustomersView({ customers, retired, query, isOwner }) {
  /* The CARDS COUNT EVERY ACCOUNT, the table shows the matches. A search that
     silently changed "total outstanding" into "total outstanding among rows
     matching 'ahm'" would be a figure that looks like the headline and is not. */
  const visible = customers.filter((customer) => matches(customer, query));

  const balances = customers.map((customer) => Math.max(0, Number(customer.balance)));
  // In whole paisa (sumMoney): this was a running double addition.
  const totalOwed = sumMoney(balances);
  const owingNow = balances.filter((balance) => balance > 0).length;
  const largest = balances.length > 0 ? Math.max(...balances) : 0;

  return (
    <>
      <TitleHeader
        title="Customers"
        icon="customers"
        tone="credit"
        description="Credit accounts and what each one currently owes."
      />

      {customers.length === 0 ? (
        <div className="mt-5">
          <EmptyState
            icon="customers"
            title="No customers yet"
            description="Add the people who take fuel on credit. Once they exist you can attach them to credit slips on the readings screen."
          >
            <CustomerForm />
          </EmptyState>
        </div>
      ) : (
        <>
          {/* FOUR FIGURES, AND "OVER THEIR LIMIT" IS NOT ONE OF THEM - the owner
              asked for it to go. Most accounts here have no credit limit on
              file, so a count of who is over one was a figure about the
              minority of rows that happened to have the field filled in. */}
          <section aria-label="Credit at a glance" className="mt-5">
            <KpiGrid>
              <KpiCard
                label="Total outstanding"
                icon="credit"
                tone="credit"
                value={formatPKR(totalOwed)}
                sub={`Across ${customers.length} account${customers.length === 1 ? '' : 's'}`}
              />
              <KpiCard
                label="On the list"
                icon="customers"
                tone="neutral"
                value={String(customers.length)}
                sub="Active credit accounts"
              />
              <KpiCard
                label="Owing right now"
                icon="account"
                tone="credit"
                value={String(owingNow)}
                sub={`${Math.round((owingNow / customers.length) * 100)}% of accounts`}
              />
              <KpiCard
                label="Largest balance"
                icon="moneyOut"
                tone="credit"
                value={formatPKR(largest)}
                sub="The biggest single debt"
              />
            </KpiGrid>
          </section>

          {/* THE TABLE OWNS ITS OWN HEADER BAR - title on the left, search and
              "Add a customer" on the right - instead of the button sitting up
              in the page header. The owner asked for this arrangement: search
              and Add both act on the TABLE, and a control that acts on a table
              belongs against it rather than against the page title, where it
              reads as applying to everything below it, the Removed list too. */}
          <section
            aria-labelledby="all-customers-heading"
            data-card
            className="panel mt-5 overflow-hidden"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-200 px-5 py-4">
              <h2 id="all-customers-heading" className="text-lg font-bold text-ink-900">
                All customers{' '}
                <span className="tabular font-semibold text-ink-600">({visible.length})</span>
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <CustomerSearch />
                <CustomerForm />
              </div>
            </div>

            <div className="table-scroll mx-0 px-0">
              <table className="w-full min-w-[44rem]">
                {/* RULED IN BOTH DIRECTIONS, at the owner's request: vertical
                    hairlines earn their place once a row carries several short
                    fields of the same weight, which is when the eye starts
                    sliding between neighbouring cells on a wide row. */}
                <thead>
                  <tr className="divide-x divide-ink-200">
                    <th className="th pl-5">Customer</th>
                    <th className="th">Phone</th>
                    <th className="th text-right">Credit limit</th>
                    <th className="th text-right">Owes</th>
                    <th className="th pr-5">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-200">
                  {visible.map((customer) => {
                    const balance = Number(customer.balance);
                    const limit =
                      customer.credit_limit === null ? null : Number(customer.credit_limit);
                    const isOverLimit = limit !== null && balance > limit;
                    const used = limit !== null && limit > 0 ? (balance / limit) * 100 : null;

                    return (
                      <tr
                        key={customer.customer_id}
                        className="divide-x divide-ink-200 hover:bg-ink-50"
                      >
                        <td className="td pl-5">
                          <CustomerCell customer={customer} />
                        </td>

                        {/* `tel:` rather than plain text - this list is read on
                            a tablet at the pump, and the reason to look up a
                            number is almost always to ring it. No number on
                            file leaves the cell EMPTY, as the vehicle line
                            above is left out, rather than a dash - and empty
                            rather than an `sr-only` label: that label is
                            absolutely positioned, a body cell is not, so it
                            escaped the table's scroller and widened the whole
                            page by 17px on a phone. */}
                        <td className="td whitespace-nowrap">
                          {customer.phone ? (
                            <a
                              href={`tel:${String(customer.phone).replace(/\s+/g, '')}`}
                              className="tabular font-medium text-ink-800 hover:text-brand-700 hover:underline"
                            >
                              {customer.phone}
                            </a>
                          ) : null}
                        </td>

                        {/* A BAR UNDER THE LIMIT, not a percentage beside it: how
                            close an account is to its ceiling is a proportion,
                            and a proportion is read off a length faster than
                            off a number. Only where a ceiling exists - no limit
                            says so in words rather than an empty track, which
                            would imply a limit of zero. Green under, red over;
                            the "Over limit" badge carries "over", the colour is
                            the second cue. */}
                        <td className="td-num text-ink-700">
                          {limit === null ? (
                            <span className="font-normal text-ink-600">No limit</span>
                          ) : (
                            // As wide as its figure, never narrower than the
                            // bar needs: a fixed 96px clipped a seven-figure
                            // limit ("Rs 1,000,000") at every width.
                            <div className="ml-auto w-fit min-w-24">
                              <span className="tabular block">{formatPKR(limit)}</span>
                              <span
                                className="mt-1 block h-1.5 overflow-hidden rounded-full bg-ink-200"
                                aria-hidden="true"
                              >
                                <span
                                  className={`block h-full rounded-full ${
                                    isOverLimit ? 'bg-red-600' : 'bg-brand-600'
                                  }`}
                                  style={{ width: `${Math.min(100, Math.max(0, used ?? 0))}%` }}
                                />
                              </span>
                            </div>
                          )}
                        </td>

                        <td className="td-num">
                          <span
                            className={[
                              'tabular block font-bold',
                              balance > 0
                                ? isOverLimit
                                  ? 'text-red-700'
                                  : 'text-ink-900'
                                : 'text-brand-700',
                            ].join(' ')}
                          >
                            {formatPKR(balance)}
                          </span>
                          {isOverLimit ? (
                            <span className="badge mt-1 bg-red-100 text-red-800">Over limit</span>
                          ) : null}
                        </td>

                        <td className="td pr-5">
                          <div className="flex items-center justify-end gap-1">
                            <EditCustomerButton
                              customer={{
                                id: customer.customer_id,
                                name: customer.name,
                                vehicle_number: customer.vehicle_number,
                                phone: customer.phone,
                                credit_limit: customer.credit_limit,
                              }}
                              iconOnly
                            />
                            {isOwner ? (
                              <RemoveCustomerButton
                                customerId={customer.customer_id}
                                name={customer.name}
                                balance={balance}
                              />
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* A search that matches nothing must say so inside the table, not
                leave an empty ruled box that reads as a loading state. */}
            {visible.length === 0 ? (
              <p className="px-5 py-8 text-center text-base text-ink-700">
                No customer matches <span className="font-semibold">“{query}”</span>.
              </p>
            ) : null}
          </section>
        </>
      )}

      {/* Removed accounts, and the way back. Without this, "removed" would be
          indistinguishable from "lost" - and one of the two things Remove can
          do is only a hide, so the owner has to be able to see what he hid. */}
      {retired.length > 0 ? (
        <section aria-labelledby="removed-heading" className="@container mt-12">
          <SectionHeader
            id="removed-heading"
            icon="trash"
            tone="neutral"
            title="Removed"
            description="Off the customer list and off the credit-slip dropdown. Everything they ever took or paid still counts towards the months it belongs to. A name added by mistake can be deleted for good from here, but only if it never actually traded; the app will say so if it did."
          />
          <div data-card className="panel overflow-hidden">
            <div className="table-scroll mx-0 px-0">
              <table className="w-full min-w-[34rem]">
                <thead>
                  <tr>
                    <th className="th pl-5">Customer</th>
                    <th className="th text-right">Owes</th>
                    <th className="th pr-5">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {retired.map((customer) => (
                    <tr key={customer.customer_id}>
                      <td className="td pl-5">
                        <CustomerCell customer={customer} muted />
                      </td>
                      <td className="td-num text-ink-700">{formatPKR(customer.balance)}</td>
                      {/* Bring back sits beside Delete for good on purpose: the
                          two opposite endings for a removed account, and the
                          recoverable one is named first. */}
                      <td className="td pr-5">
                        <div className="flex flex-wrap items-start justify-end gap-2">
                          <RestoreCustomerButton customerId={customer.customer_id} />
                          <PurgeCustomerButton
                            customerId={customer.customer_id}
                            name={customer.name}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}
