import Button from '@/app/_components/ui/Button';
import EmptyState from '@/app/_components/ui/EmptyState';
import Icon from '@/app/_components/ui/Icon';
import PendingLink from '@/app/_components/ui/PendingLink';
import CategoryBreakdown from '@/app/_components/admin/CategoryBreakdown';
import ExpenseForm from '@/app/_components/admin/ExpenseForm';
import DeleteExpenseButton from '@/app/_components/admin/DeleteExpenseButton';
import TitleHeader from '@/app/_components/admin/dashboard/TitleHeader';
import SectionHeader from '@/app/_components/admin/dashboard/SectionHeader';
import KpiCard, { KpiGrid } from '@/app/_components/admin/dashboard/KpiCard';

import { formatDate, formatMonth } from '@/app/_lib/date-helpers';
import { formatPKR, sumMoney } from '@/app/_lib/format-helpers';

/**
 * What the pump spends, drawn - in the new look (docs/UI_CONVENTIONS.md -> "The
 * new look"): salaries, electricity, rent, repairs, month by month.
 *
 * Its own section rather than a block at the bottom of Reports: Reports is read
 * once a month, and an expense is written down the day it is paid.
 */
export default function ExpensesView({ monthParam, year, month, expenses, usedCategories }) {
  const monthName = formatMonth(year, month);

  // Added in whole paisa (sumMoney) - these were running double additions.
  const total = sumMoney(expenses.map((expense) => expense.amount));

  // A recovery row (053_expense_recovery_rows.sql) is a negative amount in the
  // same table. It already nets into `total`; this is the same rows summed the
  // other way round, for their own card.
  const recoveries = expenses.filter((expense) => Number(expense.amount) < 0);
  const recoveredTotal = sumMoney(recoveries.map((expense) => Math.abs(Number(expense.amount))));

  // Biggest first - the point of the breakdown is which costs dominate the
  // month, and that ordering answers it without reading every line.
  const byCategory = Object.entries(
    expenses.reduce((acc, expense) => {
      acc[expense.category] = sumMoney([acc[expense.category] ?? 0, expense.amount]);
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);

  // What the shares in the breakdown are a percentage OF: the categories that
  // cost money this month. Not `total`, which is net of recoveries - a bill
  // repaid this month but paid last month would shrink it, and the shares of
  // everything else would add up to more than 100%. See CategoryBreakdown.
  const spentInCategories = sumMoney(
    byCategory.filter(([, amount]) => amount > 0).map(([, amount]) => amount),
  );

  return (
    <>
      <TitleHeader
        title="Expenses"
        icon="expenses"
        tone="neutral"
        description="What the pump spends, month by month."
      >
        {/* A plain GET form: picking a month is a navigation, and the route
            change brings its own loading state. */}
        <form method="GET" action="/admin/expenses" className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="month">
            Month
          </label>
          <input
            id="month"
            type="month"
            name="month"
            defaultValue={monthParam}
            // Its own width, not `.input`'s full one: in a row that wraps, a
            // full-width box pushed Show onto a line of its own at 1600px.
            className="input w-auto py-2"
          />
          <Button variant="secondary" type="submit">
            Show
          </Button>
        </form>

        {/* Two buttons, two dialogs, rather than one form with a Paid
            out/Recovered switch inside it - see ExpenseForm. */}
        <ExpenseForm used={usedCategories} kind="paid" />
        <ExpenseForm used={usedCategories} kind="recovered" />
      </TitleHeader>

      {/* THREE CARDS. A "biggest category" card was tried and dropped: a
          category here is free text ("salary of haseeb and pump tea and
          lunch"), and a headline figure keeps to one line because it is built
          for money, so a sentence arrived truncated. The breakdown shows the
          same thing in full and in order. Recovered (053) earns its own card
          because "Spent" already nets recoveries out silently - a reader
          checking the month needs the two movements separately to trust the
          net figure. */}
      <section aria-label={`Expenses in ${monthName}`} className="mt-5">
        <KpiGrid columns={3}>
          {/* "Spent" and "Recovered", with the month in the line under the
              figure: a card's label never wraps (so the four cards on the
              Dashboard keep one height), and "Recovered in September 2026"
              ran out of its card on a phone. The month also heads the table. */}
          <KpiCard
            label="Spent"
            icon="expenses"
            tone="neutral"
            value={formatPKR(total)}
            sub={
              <>
                {monthName} · {expenses.length} expense{expenses.length === 1 ? '' : 's'} ·{' '}
                <PendingLink
                  href={`/admin/reports?month=${monthParam}`}
                  className="font-semibold text-brand-700 underline-offset-2 hover:underline"
                >
                  counted in profit
                </PendingLink>
              </>
            }
          />
          <KpiCard
            label="Recovered"
            icon="moneyIn"
            tone="money"
            value={formatPKR(recoveredTotal)}
            sub={`${monthName} · ${recoveries.length} repayment${recoveries.length === 1 ? '' : 's'}`}
          />
          <KpiCard
            label="Categories used"
            icon="list"
            tone="neutral"
            value={String(byCategory.length)}
            sub={
              byCategory.length > 0 && byCategory[0][1] > 0 && spentInCategories > 0
                ? `The biggest is ${Math.round((byCategory[0][1] / spentInCategories) * 100)}% of the month`
                : null
            }
          />
        </KpiGrid>
      </section>

      <section aria-labelledby="month-heading" className="@container mt-12">
        <SectionHeader
          id="month-heading"
          icon="date"
          tone="neutral"
          title={monthName}
          description="Newest first. A repayment against a bill is marked Recovered and nets against its category."
        />

        {expenses.length === 0 ? (
          <EmptyState
            icon="expenses"
            title="Nothing recorded for this month"
            description="Record what the pump has paid out with Add expense above: salaries, electricity, rent, repairs. Pick a different month above to see what was spent then."
          />
        ) : (
          /* The breakdown beside the table where there is room, above it where
             there is not: which costs dominate the month is read once, the rows
             are read down. */
          <div className="grid items-start gap-5 @[64rem]:grid-cols-[22rem_1fr] [&>*]:min-w-0">
            {byCategory.length > 0 ? (
              <CategoryBreakdown
                title="Where it went"
                rows={byCategory}
                total={spentInCategories}
              />
            ) : null}

            <div data-card className="panel overflow-hidden">
              <div className="table-scroll mx-0 px-0">
                <table className="w-full min-w-[30rem]">
                  <thead>
                    <tr>
                      <th className="th pl-5">Date</th>
                      <th className="th">Category</th>
                      <th className="th text-right">Amount</th>
                      <th className="th pr-5">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {expenses.map((expense) => {
                      // A recovery row - see 053_expense_recovery_rows.sql. It
                      // has to read as money coming BACK rather than as a
                      // mistake: the colour-plus-icon distinction Treasury
                      // draws between cash in and cash out.
                      const isRecovery = Number(expense.amount) < 0;

                      return (
                        <tr key={expense.id}>
                          <td className="td whitespace-nowrap pl-5 font-semibold text-ink-900">
                            {formatDate(expense.expense_date)}
                          </td>
                          {/* THE NOTE IS A LINE UNDER THE CATEGORY, not a
                              column of its own - the rule the Stock page's
                              history set (UI_CONVENTIONS.md -> "Tables in the
                              new look"). */}
                          <td className="td">
                            <span className="font-medium text-ink-900">{expense.category}</span>
                            {isRecovery ? (
                              <span className="badge ms-2 bg-brand-50 text-brand-800">Recovered</span>
                            ) : null}
                            {expense.note ? (
                              <span className="mt-1 block max-w-[48ch] whitespace-normal text-sm text-ink-700 [overflow-wrap:anywhere]">
                                <span className="font-semibold text-ink-800">Note:</span>{' '}
                                {expense.note}
                              </span>
                            ) : null}
                          </td>
                          <td
                            className={`td-num font-semibold ${
                              isRecovery ? 'text-brand-700' : 'text-ink-900'
                            }`}
                          >
                            {isRecovery ? (
                              <span className="inline-flex items-center justify-end gap-1.5">
                                <Icon name="moneyIn" className="h-4 w-4" />
                                {formatPKR(Math.abs(expense.amount))}
                              </span>
                            ) : (
                              formatPKR(expense.amount)
                            )}
                          </td>
                          <td className="td pr-5">
                            <DeleteExpenseButton
                              expenseId={expense.id}
                              summary={`${expense.category} ${formatPKR(Math.abs(expense.amount))}${
                                isRecovery ? ' recovered' : ''
                              }`}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
