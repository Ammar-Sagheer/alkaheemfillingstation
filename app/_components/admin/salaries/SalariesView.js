import Button from '@/app/_components/ui/Button';
import EmptyState from '@/app/_components/ui/EmptyState';
import DayHeader from '@/app/_components/admin/dashboard/DayHeader';
import SectionHeader from '@/app/_components/admin/dashboard/SectionHeader';
import KpiCard, { KpiGrid } from '@/app/_components/admin/dashboard/KpiCard';
import Notice from '@/app/_components/admin/dashboard/Notice';
import AttendanceRegister from '@/app/_components/admin/salaries/AttendanceRegister';
import {
  AddStaffButton,
  CancelPaymentButton,
  ChangeRateButton,
  PaySalaryButton,
  RemoveStaffButton,
  RestoreStaffButton,
} from '@/app/_components/admin/salaries/StaffControls';

import { formatDate, formatMonth } from '@/app/_lib/date-helpers';
import { formatPKR, sumMoney } from '@/app/_lib/format-helpers';

/** "21 days", "20.5 days", "1 day". */
function days(value) {
  const n = Number(value ?? 0);
  return `${Number.isInteger(n) ? n : n.toFixed(1)} ${n === 1 ? 'day' : 'days'}`;
}

function monthParts(monthStart) {
  const [year, month] = monthStart.split('-').map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    year,
    month,
    label: formatMonth(year, month),
    end: `${monthStart.slice(0, 8)}${String(last).padStart(2, '0')}`,
  };
}

/** The rate in force today: the newest that has started, else the first one. */
function currentRate(person, today) {
  const started = person.rates.find((rate) => rate.effective_from <= today);
  return started ?? person.rates.at(-1) ?? null;
}

/**
 * Staff attendance and salaries (802, Al Hakeem first), drawn.
 *
 * ONE PAGE, IN THE ORDER IT IS USED. The register for the day on screen is on
 * top, because it is the thing done every day; the month's pay under it, done
 * once a month; the staff list last, set up once. A staff login sees the
 * register only.
 */
export default function SalariesView({
  date,
  today,
  monthStart,
  monthParam,
  staff,
  attendance,
  salaries,
  unpaidLastMonth,
  lastMonthStart,
  isOwner,
}) {
  const active = staff.filter((person) => person.is_active);
  const retired = staff.filter((person) => !person.is_active);
  const month = monthParts(monthStart);
  const extraParams = monthParam ? { month: monthParam } : undefined;
  const isFuture = date > today;

  // Summed in whole paisa (sumMoney), from figures Postgres worked out.
  const earned = sumMoney(salaries.map((row) => row.earned));
  const paid = sumMoney(salaries.map((row) => row.payment?.amount ?? 0));
  const toPay = sumMoney(salaries.filter((row) => !row.payment).map((row) => row.earned));
  const unpaidCount = salaries.filter((row) => !row.payment && Number(row.earned) > 0).length;

  const monthHref = (value) => `/admin/salaries?date=${date}&month=${value.slice(0, 7)}`;
  const lastMonth = lastMonthStart ? monthParts(lastMonthStart) : null;

  return (
    <>
      <DayHeader
        date={date}
        basePath="/admin/salaries"
        extraParams={extraParams}
        title={isOwner ? 'Staff and salaries' : 'Staff attendance'}
        icon="staff"
      />

      {isOwner && unpaidLastMonth > 0 && lastMonth ? (
        <Notice tone="warn" icon="salary" title={`${lastMonth.label} is not fully paid`} className="mt-4">
          {unpaidLastMonth === 1 ? 'One person has' : `${unpaidLastMonth} people have`} days in{' '}
          {lastMonth.label} with no salary recorded.{' '}
          <a className="font-semibold underline" href={monthHref(lastMonthStart)}>
            Show {lastMonth.label}
          </a>
        </Notice>
      ) : null}

      {/* ---------------------------------------------------- the register */}
      <section aria-labelledby="attendance-heading" className="@container mt-10">
        <SectionHeader
          id="attendance-heading"
          icon="attendance"
          title="Attendance"
          description={`Who worked on ${formatDate(date)}. Tap one choice per person; it saves straight away.`}
        />
        {isFuture ? (
          <Notice tone="info" title="This day has not come yet" className="mb-4">
            Attendance can be marked for today and the days before it.
          </Notice>
        ) : null}
        {active.length === 0 ? (
          <div data-card className="panel">
            <EmptyState
              icon="staff"
              title="No staff yet"
              description={
                isOwner
                  ? 'Add each person the pump pays by the day, with their daily rate, under Staff list below. They then appear here every day to be marked.'
                  : 'The owner adds the staff on this page. They then appear here every day to be marked.'
              }
            />
          </div>
        ) : (
          <AttendanceRegister key={date} staff={active} date={date} initial={attendance} disabled={isFuture} />
        )}
      </section>

      {isOwner ? (
        <>
          {/* ---------------------------------------------- the month's pay */}
          <section aria-labelledby="salaries-heading" className="@container mt-12">
            <SectionHeader
              id="salaries-heading"
              icon="salary"
              tone="money"
              title={`Salaries, ${month.label}`}
              description="What each person earned from the register, and paying it. A payment goes into Expenses and comes off the month's profit."
            >
              <form method="GET" action="/admin/salaries" className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="date" value={date} />
                <label className="sr-only" htmlFor="salary-month">
                  Month
                </label>
                <input
                  id="salary-month"
                  type="month"
                  name="month"
                  defaultValue={monthStart.slice(0, 7)}
                  className="input w-auto py-2"
                />
                <Button variant="secondary" type="submit">
                  Show
                </Button>
              </form>
            </SectionHeader>

            <KpiGrid columns={3}>
              <KpiCard label="Earned" value={formatPKR(earned)} icon="attendance" tone="neutral" sub={`${month.label}, from the days marked`} />
              <KpiCard label="Paid" value={formatPKR(paid)} icon="salary" tone="money" sub="Recorded in Expenses" />
              <KpiCard
                label="Still to pay"
                value={formatPKR(toPay)}
                icon="warning"
                tone={unpaidCount > 0 ? 'alert' : 'neutral'}
                sub={unpaidCount === 0 ? 'Nobody waiting' : unpaidCount === 1 ? '1 person' : `${unpaidCount} people`}
              />
            </KpiGrid>

            {salaries.length === 0 ? null : (
              <div data-card className="panel mt-5 overflow-hidden">
                <div className="table-scroll mx-0 max-h-none px-0">
                  <table className="w-full min-w-[34rem]">
                    <thead>
                      <tr>
                        <th className="th pl-5">Staff</th>
                        <th className="th text-right">Daily rate</th>
                        <th className="th whitespace-nowrap">Days worked</th>
                        <th className="th pr-5 text-right">Earned and paid</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100">
                      {salaries.map((row) => (
                        <tr key={row.staff_id} className={row.is_active ? undefined : 'bg-ink-50/60'}>
                          <td className="td pl-5">
                            <span className="block font-semibold text-ink-900">
                              {row.name}
                              {row.is_active ? null : (
                                <span className="badge ml-2 bg-ink-100 font-normal text-ink-700">Removed</span>
                              )}
                            </span>
                            {row.job ? <span className="block text-sm text-ink-600">{row.job}</span> : null}
                          </td>
                          <td className="td-num">
                            {formatPKR(row.daily_rate)}
                            {Number(row.rate_changes) > 0 ? (
                              <span className="block text-sm font-normal whitespace-nowrap text-ink-600">changed in month</span>
                            ) : null}
                          </td>
                          {/* One column, not four: Present, Half, Absent and Not marked
                              side by side pushed the Pay button off the card below
                              1366px. The total is the figure; the split is under it. */}
                          <td className="td">
                            <span className="tabular block font-semibold whitespace-nowrap text-ink-900">
                              {days(row.days_worked)}
                            </span>
                            <span className="tabular block text-sm text-ink-600">
                              <span className="whitespace-nowrap">{row.present} full,</span>{' '}
                              <span className="whitespace-nowrap">{row.half} half,</span>{' '}
                              <span className="whitespace-nowrap">{row.absent} absent</span>
                            </span>
                            {Number(row.not_marked) > 0 ? (
                              <span className="tabular block text-sm font-semibold text-amber-800">
                                {row.not_marked} not marked
                              </span>
                            ) : null}
                          </td>
                          {/* Earned and what was done about it, in one cell: as two
                              columns the Pay button was the first thing to scroll
                              off the card on a laptop with the sidebar open. */}
                          <td className="td pr-5 text-right">
                            <span className="tabular mb-1.5 block text-lg font-bold whitespace-nowrap text-ink-900">
                              {formatPKR(row.earned)}
                            </span>
                            {row.payment ? (
                              <div className="flex items-start justify-end gap-2">
                                <span className="text-right">
                                  <span className="tabular block font-semibold whitespace-nowrap text-brand-700">
                                    Paid {formatPKR(row.payment.amount)}
                                  </span>
                                  <span className="block text-sm whitespace-nowrap text-ink-600">
                                    {formatDate(row.payment.paid_on)}
                                  </span>
                                  {row.payment.note ? (
                                    <span className="block max-w-[12rem] text-sm text-ink-600">
                                      {row.payment.note}
                                    </span>
                                  ) : null}
                                </span>
                                <CancelPaymentButton
                                  payment={row.payment}
                                  name={row.name}
                                  amountLabel={formatPKR(row.payment.amount)}
                                />
                              </div>
                            ) : Number(row.earned) > 0 ? (
                              <PaySalaryButton
                                row={row}
                                monthStart={monthStart}
                                monthEnd={month.end}
                                monthLabel={month.label}
                                earnedLabel={formatPKR(row.earned)}
                                daysLabel={`${days(row.days_worked)} worked: ${row.present} present, ${row.half} half, ${row.absent} absent${Number(row.not_marked) > 0 ? `, ${row.not_marked} not marked` : ''}`}
                              />
                            ) : (
                              <span className="text-sm text-ink-600">Nothing earned</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="caption border-t border-ink-200 px-5 py-3">
                  A half day is paid half the daily rate. A day not marked is not paid: mark it first.
                  Once a month is paid, its attendance is closed until the payment is cancelled.
                </p>
              </div>
            )}
          </section>

          {/* ------------------------------------------------ the people */}
          <section aria-labelledby="staff-heading" className="@container mt-12">
            <SectionHeader
              id="staff-heading"
              icon="staff"
              title="Staff list"
              description="Everyone the pump pays by the day, and their daily rate. Not the logins: those are under Account."
            >
              <AddStaffButton />
            </SectionHeader>

            {staff.length === 0 ? null : (
              <div data-card className="panel overflow-hidden">
                <div className="table-scroll mx-0 max-h-none px-0">
                  <table className="w-full min-w-[40rem]">
                    <thead>
                      <tr>
                        <th className="th pl-5">Name</th>
                        <th className="th">Phone</th>
                        <th className="th text-right">Daily rate</th>
                        <th className="th">Since</th>
                        <th className="th pr-5">
                          <span className="sr-only">Change</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100">
                      {[...active, ...retired].map((person) => {
                        const rate = currentRate(person, today);
                        return (
                          <tr key={person.id} className={person.is_active ? undefined : 'bg-ink-50/60 text-ink-600'}>
                            <td className="td pl-5">
                              <span className="block font-semibold whitespace-nowrap text-ink-900">
                                {person.name}
                                {person.is_active ? null : (
                                  <span className="badge ml-2 bg-ink-100 font-normal text-ink-700">Removed</span>
                                )}
                              </span>
                              {person.job ? <span className="block text-sm text-ink-600">{person.job}</span> : null}
                            </td>
                            <td className="td tabular whitespace-nowrap">{person.phone ?? ''}</td>
                            <td className="td-num font-semibold">{rate ? formatPKR(rate.daily_rate) : ''}</td>
                            <td className="td whitespace-nowrap">{rate ? formatDate(rate.effective_from) : ''}</td>
                            <td className="td pr-5">
                              <div className="flex items-center justify-end gap-2">
                                {person.is_active ? (
                                  <>
                                    <ChangeRateButton
                                      person={person}
                                      rateLabel={rate ? formatPKR(rate.daily_rate) : ''}
                                    />
                                    <RemoveStaffButton person={person} />
                                  </>
                                ) : (
                                  <RestoreStaffButton person={person} />
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        </>
      ) : null}
    </>
  );
}
