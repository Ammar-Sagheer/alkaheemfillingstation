import EmptyState from '@/app/_components/ui/EmptyState';
import Icon from '@/app/_components/ui/Icon';
import Pager from '@/app/_components/ui/Pager';
import BankAccountForm from '@/app/_components/admin/BankAccountForm';
import BankTransactionForm from '@/app/_components/admin/BankTransactionForm';
import DeleteBankAccountButton from '@/app/_components/admin/DeleteBankAccountButton';
import MakeMainAccountButton from '@/app/_components/admin/MakeMainAccountButton';
import DeleteBankTransactionButton from '@/app/_components/admin/DeleteBankTransactionButton';
import TitleHeader from '@/app/_components/admin/dashboard/TitleHeader';
import SectionHeader from '@/app/_components/admin/dashboard/SectionHeader';
import KpiCard, { KpiGrid } from '@/app/_components/admin/dashboard/KpiCard';
import Notice from '@/app/_components/admin/dashboard/Notice';
import { TILE } from '@/app/_components/admin/dashboard/tones';

import { formatDate } from '@/app/_lib/date-helpers';
import { formatPKR, sumMoney } from '@/app/_lib/format-helpers';

export const PER_PAGE = 25;

/**
 * The owner's bank accounts, drawn - in the new look (docs/UI_CONVENTIONS.md ->
 * "The new look"): what has gone in, what has gone out, what is left.
 *
 * Cash from the pump is paid into a bank account and pump costs are paid back
 * out of it by transfer. Nothing else in the app knows about that money, so
 * without this page the only record of it is the bank's own statement.
 */
export default function BankingView({ page, accounts, transactions, total = 0 }) {
  // Across every account, in whole paisa (sumMoney) - these were running
  // double additions.
  const totals = {
    balance: sumMoney(accounts.map((account) => account.balance)),
    deposited: sumMoney(accounts.map((account) => account.total_deposited)),
    paid: sumMoney(accounts.map((account) => account.total_paid)),
  };

  /*
   * `transactions` is one page, fetched as a page in Postgres (070: the list
   * is no longer capped, so it is no longer small). Each account's own count
   * comes from the balances view, which counts every row.
   */
  const pageTransactions = transactions;

  // Entries the old 60-per-account cap removed before 070. A count of rows,
  // not money; their amounts are already inside each balance.
  const removedBefore = accounts.reduce((sum, account) => sum + Number(account.pruned_count ?? 0), 0);

  return (
    <>
      <TitleHeader
        title="Banking"
        icon="banking"
        tone="held"
        description="Money paid into the bank, and what has been paid out of it for the pump."
      >
        {/* Adding an account is a page-level job done twice and then rarely
            again, so it belongs up here as one button rather than as a form
            standing open all day next to the one used every week. */}
        {accounts.length > 0 ? <BankAccountForm /> : null}
      </TitleHeader>

      {accounts.length === 0 ? (
        <div className="mt-5">
          <EmptyState
            icon="banking"
            title="No accounts yet"
            description="Add the accounts the pump's money passes through. Once one exists you can record cash paid in and transfers paid out."
          >
            <BankAccountForm trigger="empty" />
          </EmptyState>
        </div>
      ) : (
        <>
          {/* Across every account, because the question the owner actually asks
              is how much money there is, not how it is split. */}
          <section aria-label="Across all accounts" className="mt-5">
            <KpiGrid columns={3}>
              <KpiCard
                label="Balance now"
                icon="banking"
                tone="held"
                value={formatPKR(totals.balance)}
                sub={`Across ${accounts.length} account${accounts.length === 1 ? '' : 's'}`}
                alert={totals.balance < 0 ? 'Overdrawn: more has gone out than came in' : null}
              />
              <KpiCard
                label="Paid in, all time"
                icon="moneyIn"
                tone="money"
                value={formatPKR(totals.deposited)}
                sub="Cash from the pump, into the bank"
              />
              <KpiCard
                label="Paid out, all time"
                icon="moneyOut"
                tone="neutral"
                value={formatPKR(totals.paid)}
                sub="Transfers out for the pump"
              />
            </KpiGrid>
          </section>

          <section aria-labelledby="accounts-heading" className="@container mt-12">
            <SectionHeader
              id="accounts-heading"
              icon="banking"
              tone="held"
              title="Accounts"
              description="Each account's balance, and everything paid into and out of it."
            />
            {/* ONE HEIGHT PER ROW: the grid's own stretch, not `items-start`.
                Two accounts side by side are two of the same thing, and one
                stopping short of the other read as broken (reported 27 Sep
                2026). Each card ends on the same line - see AccountCard. */}
            <div className="grid gap-5 @[50rem]:grid-cols-2">
              {accounts.map((account) => (
                <AccountCard
                  key={account.id}
                  account={account}
                  transactionCount={Number(account.kept_count ?? 0)}
                />
              ))}
            </div>
          </section>

          {/* THE FORM STANDS OPEN BESIDE THE TABLE, not behind a dialog: money
              in and money out is recorded every week, and it is the one form
              on this page that is. But only where the table can afford it
              ("A form beside a table is a form the table is paying for",
              UI_CONVENTIONS.md): side by side from 80rem of section, which the
              owner's 1600px laptop has with the sidebar pinned or not, and the
              table gets about 950px. Measured below that: at 1366 beside a
              pinned sidebar the table got 720px, the account and the purpose
              shared 200 of it, and a note ran eleven lines deep; at 62rem
              (where 1024px landed exactly) it scrolled. There the form stacks
              above the table, capped so its fields do not run the width of
              the page. */}
          <section aria-labelledby="transactions-heading" className="@container mt-12">
            <SectionHeader
              id="transactions-heading"
              icon="list"
              tone="neutral"
              title="Transactions"
              description="Newest first, across every account."
            />
            <div className="grid items-start gap-5 @[80rem]:grid-cols-[22rem_1fr] [&>*]:min-w-0">
              <BankTransactionForm accounts={accounts} />

              <div>
                {/* Every entry is kept since 070. The ones the old cap removed
                    are said once, so a reader who remembers them is not left
                    wondering where they went. */}
                {removedBefore > 0 ? (
                  <Notice tone="info" className="mb-4">
                    Every entry is kept. Until 2 Oct 2026 only the latest 60 per account were, and{' '}
                    <span className="font-semibold">{removedBefore}</span> older{' '}
                    {removedBefore === 1 ? 'entry was' : 'entries were'} removed then. Their amounts are
                    still counted in the balances above.
                  </Notice>
                ) : null}

                {total === 0 ? (
                  <EmptyState
                    icon="list"
                    title="Nothing recorded yet"
                    description="Record the first deposit or payment using the form."
                  />
                ) : (
                  <>
                    <div data-card className="panel overflow-hidden">
                      <div className="table-scroll mx-0 px-0">
                        <table className="w-full min-w-[44rem]">
                          <thead>
                            <tr>
                              <th className="th pl-5">Date</th>
                              <th className="th">Account</th>
                              <th className="th">What for</th>
                              <th className="th text-right">In</th>
                              <th className="th text-right">Out</th>
                              <th className="th pr-5">
                                <span className="sr-only">Actions</span>
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-ink-100">
                            {pageTransactions.map((txn) => {
                              const isDeposit = txn.txn_type === 'deposit';
                              return (
                                <tr key={txn.id}>
                                  <td className="td whitespace-nowrap pl-5 font-semibold text-ink-900">
                                    {formatDate(txn.txn_date)}
                                  </td>
                                  <td className="td">{txn.account?.account_label}</td>
                                  <td className="td">
                                    <span>
                                      {txn.category ?? (isDeposit ? 'Cash paid in' : 'Paid out')}
                                    </span>
                                    {txn.note ? (
                                      <span className="mt-1 block max-w-[48ch] whitespace-normal text-sm text-ink-700 [overflow-wrap:anywhere]">
                                        <span className="font-semibold text-ink-800">Note:</span>{' '}
                                        {txn.note}
                                      </span>
                                    ) : null}
                                  </td>
                                  {/* The arrow is the second cue beside the
                                      colour: green against amber alone is what a
                                      colourblind reader cannot use, and the two
                                      columns are otherwise identical in shape. */}
                                  <td className="td-num font-semibold text-brand-700">
                                    {isDeposit ? (
                                      <span className="inline-flex items-center justify-end gap-1.5">
                                        <Icon name="moneyIn" className="h-4 w-4" />
                                        {formatPKR(txn.amount)}
                                      </span>
                                    ) : null}
                                  </td>
                                  <td className="td-num font-semibold text-amber-800">
                                    {isDeposit ? null : (
                                      <span className="inline-flex items-center justify-end gap-1.5">
                                        <Icon name="moneyOut" className="h-4 w-4" />
                                        {formatPKR(txn.amount)}
                                      </span>
                                    )}
                                  </td>
                                  <td className="td pr-5 text-right">
                                    <DeleteBankTransactionButton
                                      transactionId={txn.id}
                                      summary={`${formatPKR(txn.amount)} on ${formatDate(txn.txn_date)}`}
                                    />
                                  </td>
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
                      total={total}
                      hrefFor={(n) => `/admin/banking?page=${n}`}
                      label="Transaction pages"
                    />
                  </>
                )}
              </div>
            </div>
          </section>
        </>
      )}
    </>
  );
}

/**
 * One account: its balance, and the two directions money has moved.
 *
 * EVERY CARD HAS THE SAME SHAPE, so a row of them lines up. The grid makes the
 * cards in a row one height; inside, the header is the same two lines on every
 * card, so the balances and the paid in / paid out tiles sit level across the
 * row, and the last line - the main account, or the button to make this one
 * it - is pushed to the bottom (`mt-auto`), so it lines up too. "Main account"
 * first sat under the account's name, which made the main card's header a
 * line taller than the others and put its balance out of step with theirs.
 */
function AccountCard({ account, transactionCount }) {
  const balance = Number(account.balance ?? 0);

  return (
    <article data-card className="panel @container flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        {/* WRAPS, never truncates: on a phone "Pump current account" lost its
            last word, and the account number lost its last digit - a number
            cut short is a different number. The number is held on one line. */}
        <div className="flex min-w-0 items-start gap-3">
          <span className={`icon-tile h-10 w-10 ${TILE.held}`}>
            <Icon name="banking" className="h-[22px] w-[22px]" />
          </span>
          <div className="min-w-0 pt-0.5">
            <h3 className="text-lg font-bold leading-snug text-ink-900">{account.account_label}</h3>
            <p className="text-sm text-ink-600">
              {account.bank_name}
              {account.account_number ? (
                <>
                  {' · '}
                  <span className="tabular whitespace-nowrap">{account.account_number}</span>
                </>
              ) : null}
            </p>
          </div>
        </div>
        <DeleteBankAccountButton
          accountId={account.id}
          label={account.account_label}
          transactionCount={transactionCount}
        />
      </div>

      <p className="caption mt-4">Balance</p>
      {/* Red when overdrawn. A negative balance here means the books say more
          has gone out than went in, which is worth noticing immediately. */}
      <p
        className={`tabular whitespace-nowrap text-2xl font-bold tracking-tight @[20rem]:text-3xl ${
          balance < 0 ? 'text-red-700' : 'text-ink-900'
        }`}
      >
        {formatPKR(balance)}
      </p>

      {/* Paid in and paid out as two tiles, each with its arrow: the two
          directions money moves, told by the glyph and the word as well as by
          green against amber. Captions in sentence case at 14px - they were
          12px capitals. */}
      <dl className="mt-4 grid grid-cols-1 gap-2 @[22rem]:grid-cols-2 @[22rem]:gap-3">
        <div className="rounded-xl bg-brand-50 px-3.5 py-2.5 ring-1 ring-inset ring-brand-100">
          <dt className="flex items-center gap-1.5 text-sm font-medium text-brand-800">
            <Icon name="moneyIn" className="h-4 w-4" />
            Paid in
          </dt>
          <dd className="tabular mt-0.5 whitespace-nowrap text-lg font-bold text-brand-800">
            {formatPKR(account.total_deposited)}
          </dd>
        </div>
        <div className="rounded-xl bg-amber-50 px-3.5 py-2.5 ring-1 ring-inset ring-amber-100">
          <dt className="flex items-center gap-1.5 text-sm font-medium text-amber-900">
            <Icon name="moneyOut" className="h-4 w-4" />
            Paid out
          </dt>
          <dd className="tabular mt-0.5 whitespace-nowrap text-lg font-bold text-amber-900">
            {formatPKR(account.total_paid)}
          </dd>
        </div>
      </dl>

      {/* An account can only be below zero from before this rule existed, or
          from a deposit being deleted. Either way it is stuck until it is put
          right, so it says how rather than just showing red. */}
      {balance < 0 ? (
        <p className="callout-danger mt-3">
          Overdrawn. Nothing can be paid out of this account until it is back to zero: pay money in,
          or delete the payment that caused it.
        </p>
      ) : null}

      {account.pruned_count > 0 ? (
        <p className="mt-3 text-sm text-ink-600">
          {account.pruned_count} older transaction{account.pruned_count === 1 ? ' was' : 's were'} removed
          before 2 Oct 2026, when only the latest 60 were kept. Their amounts are still counted above.
        </p>
      ) : null}

      {/* THE MAIN ACCOUNT, IN THE SAME PLACE ON EVERY CARD: the one that is
          says so, in words with a tick rather than by colour, where each of
          the others offers to become it (migration 065). Before 065 is
          applied no account is main, so every card offers, and the button
          says what is missing if pressed.
          The row is `min-h-10`, a little over the button's height, on an
          element of its own: on the element carrying the rule's padding it
          counted the padding and did nothing, and the badge row came out 9px
          shorter than the button row, so the rules above them sat out of
          line. The badge has no sentence beside it for the same reason: at
          the narrow end of two columns it wrapped to a second line. */}
      <div className="mt-auto pt-4">
        <div className="border-t border-ink-200/70 pt-4">
          <div className="flex min-h-10 items-center">
            {account.is_main ? (
              <p className="badge bg-brand-100 text-brand-800">
                <Icon name="check" className="h-4 w-4" />
                Main account
              </p>
            ) : (
              <MakeMainAccountButton accountId={account.id} label={account.account_label} />
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
