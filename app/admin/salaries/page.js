import { requirePageRole, ROLES, todayISO } from '@/app/_lib/helpers';
import { getAttendanceForDay, getSalaryMonth, getStaffMembers } from '@/app/_lib/data-service';
import SalariesView from '@/app/_components/admin/salaries/SalariesView';

export const metadata = { title: 'Salaries' };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_MONTH = /^\d{4}-\d{2}$/;

/** YYYY-MM-01 of the month before. */
function previousMonth(monthStart) {
  const [year, month] = monthStart.split('-').map(Number);
  const y = month === 1 ? year - 1 : year;
  const m = month === 1 ? 12 : month - 1;
  return `${y}-${String(m).padStart(2, '0')}-01`;
}

/**
 * Staff attendance and salaries (802). The role check and the queries;
 * `SalariesView` draws it.
 *
 * BOTH ROLES, NOT THE SAME PAGE. Staff mark the register at the pump, so they
 * reach it; the rates, the pay and the staff list are the owner's, and are
 * neither fetched nor drawn for a staff login (RLS refuses them as well).
 */
export default async function SalariesPage({ searchParams }) {
  const profile = await requirePageRole(ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY);
  const isOwner = profile.role === ROLES.SUPER_ADMIN;

  const params = await searchParams;
  const today = todayISO();
  const date = typeof params?.date === 'string' && ISO_DATE.test(params.date) ? params.date : today;
  const monthParam =
    typeof params?.month === 'string' && ISO_MONTH.test(params.month) ? params.month : null;
  const monthStart = `${monthParam ?? date.slice(0, 7)}-01`;

  /*
   * Early in a month the pay for the LAST one is what is usually still to do,
   * and the page opens on this month. So, for the first fortnight, the month
   * before is read too, and the page says so if anyone in it is unpaid.
   */
  const lookBack = isOwner && monthStart === `${today.slice(0, 7)}-01` && Number(today.slice(8)) <= 15;

  const [staff, attendance, salaries, lastMonth] = await Promise.all([
    getStaffMembers({ includeRetired: isOwner }),
    getAttendanceForDay(date),
    isOwner ? getSalaryMonth(monthStart) : Promise.resolve([]),
    lookBack ? getSalaryMonth(previousMonth(monthStart)) : Promise.resolve(null),
  ]);

  const unpaidLastMonth = (lastMonth ?? []).filter(
    (row) => !row.payment && Number(row.earned) > 0,
  ).length;

  return (
    <SalariesView
      date={date}
      today={today}
      monthStart={monthStart}
      monthParam={monthParam}
      staff={staff}
      attendance={attendance}
      salaries={salaries}
      unpaidLastMonth={unpaidLastMonth}
      lastMonthStart={lookBack ? previousMonth(monthStart) : null}
      isOwner={isOwner}
    />
  );
}
