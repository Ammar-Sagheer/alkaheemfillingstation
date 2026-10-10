import { requirePageRole, ROLES, todayISO, entryDayISO } from '@/app/_lib/helpers';
import {
  getReadingSheet,
  getCustomers,
  getCreditSalesForReadings,
  getRatesInForce,
  getBankAccounts,
  getExpenseCategories,
} from '@/app/_lib/data-service';
import ReadingsView from '@/app/_components/admin/readings/ReadingsView';

export const metadata = { title: 'Daily readings' };

/**
 * The daily entry screen - the one thing that gets used every evening.
 *
 * This file is the role check and the queries; `ReadingsView` draws it, in the
 * new look (docs/UI_CONVENTIONS.md -> "The new look"). Split the same way as the
 * Dashboard so the real page can be rendered from fixtures for a screenshot.
 *
 * Each nozzle is its own small form, saved on its own. That way a mistake on
 * one nozzle never blocks the other five, and staff can work through the slip
 * book at their own pace.
 */
export default async function ReadingsPage({ searchParams }) {
  const profile = await requirePageRole(ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY);

  const params = await searchParams;
  const askedFor =
    typeof params?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
      ? params.date
      : null;
  // After midnight the page opens on the day just traded (entryDayISO).
  const date = askedFor ?? entryDayISO();
  const afterMidnight = !askedFor && date !== todayISO();

  const isOwner = profile.role === ROLES.SUPER_ADMIN;

  // The day's expense, bank entry and deposit are entered from this page too
  // (Al Hakeem). Expenses and banking are the owner's, so a staff login neither
  // sees the bar nor has these read for it; a failure here only hides the bar.
  const [sheet, customers, ratesInForce, bankAccounts, expenseCategories] = await Promise.all([
    getReadingSheet(date),
    getCustomers(),
    getRatesInForce(date),
    isOwner ? getBankAccounts().catch(() => []) : Promise.resolve([]),
    isOwner ? getExpenseCategories().catch(() => []) : Promise.resolve([]),
  ]);

  const savedReadingIds = sheet.filter((row) => row.reading_id).map((row) => row.reading_id);
  const creditSalesByReading = await getCreditSalesForReadings(savedReadingIds);

  return (
    <ReadingsView
      date={date}
      sheet={sheet}
      customers={customers}
      creditSalesByReading={creditSalesByReading}
      ratesInForce={ratesInForce}
      isOwner={isOwner}
      bankAccounts={bankAccounts}
      expenseCategories={expenseCategories}
      afterMidnight={afterMidnight}
    />
  );
}
