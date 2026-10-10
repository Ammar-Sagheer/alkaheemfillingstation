import { requirePageRole, ROLES, todayISO, monthRange } from '@/app/_lib/helpers';
import { getExpenses, getExpenseCategories, getBankAccounts } from '@/app/_lib/data-service';
import ExpensesView from '@/app/_components/admin/expenses/ExpensesView';

export const metadata = { title: 'Expenses' };

/**
 * What the pump spends. The role check and the queries; `ExpensesView` draws
 * it, in the new look, split the same way as the Dashboard so it can be
 * rendered from fixtures.
 *
 * Owner only, like Reports and Banking - an expense feeds the profit figure,
 * and what the pump costs to run is not the staff's business.
 */
export default async function ExpensesPage({ searchParams }) {
  await requirePageRole(ROLES.SUPER_ADMIN);

  const params = await searchParams;
  const today = todayISO();

  // The month box posts back as YYYY-MM, the same as on Reports.
  const monthParam =
    typeof params?.month === 'string' && /^\d{4}-\d{2}$/.test(params.month)
      ? params.month
      : today.slice(0, 7);

  const [year, month] = monthParam.split('-').map(Number);
  const { from, to } = monthRange(year, month);

  // The month on screen, not a rolling window: the table and the totals beside
  // it then describe the same rows, so the category list can be checked by
  // reading down the table rather than taken on trust.
  const [expenses, usedCategories, bankAccounts] = await Promise.all([
    getExpenses({ from, to, limit: 200 }),
    getExpenseCategories(),
    // For Deposit to bank (805). A failure only hides the choices.
    getBankAccounts().catch(() => []),
  ]);

  return (
    <ExpensesView
      monthParam={monthParam}
      year={year}
      month={month}
      expenses={expenses}
      usedCategories={usedCategories}
      bankAccounts={bankAccounts}
    />
  );
}
