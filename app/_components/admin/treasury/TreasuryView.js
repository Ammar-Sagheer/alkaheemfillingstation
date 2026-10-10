import EmptyState from '@/app/_components/ui/EmptyState';
import Icon from '@/app/_components/ui/Icon';
import CategoryBreakdown from '@/app/_components/admin/CategoryBreakdown';
import TreasuryBalanceChart from '@/app/_components/admin/TreasuryBalanceChart';
import TreasuryEntryForm from '@/app/_components/admin/TreasuryEntryForm';
import DepositToBankForm from '@/app/_components/admin/DepositToBankForm';
import DeleteTreasuryEntryButton from '@/app/_components/admin/DeleteTreasuryEntryButton';
import TreasuryDayNav from '@/app/_components/admin/TreasuryDayNav';
import TitleHeader from '@/app/_components/admin/dashboard/TitleHeader';
import SectionHeader from '@/app/_components/admin/dashboard/SectionHeader';
import KpiCard, { KpiGrid } from '@/app/_components/admin/dashboard/KpiCard';
import Notice from '@/app/_components/admin/dashboard/Notice';
import TrendWindow from '@/app/_components/admin/dashboard/TrendWindow';

import { formatDate } from '@/app/_lib/date-helpers';
import { formatNumber, formatPKR } from '@/app/_lib/format-helpers';
import { treasuryCategoryLabel } from '@/app/_lib/treasury-categories';

/*
 * THE BALANCE COLUMN IS PINNED.
 *
 * `RegisterTable` established the pattern (see "A table too wide to read: pin
 * the ends, scroll the middle" in docs/UI_CONVENTIONS.md) and pins BOTH ends.
 * This table pins one, deliberately. The register's middle is eight columns
 * wide, so two pinned ends still leave something worth scrolling; this one's
 * middle is four, and at 400px a second pinned column would leave about 140px
 * of scrollport for a reason, an amount in and an amount out - which is the
 * "at 400px the pinned columns are very nearly the whole table" failure the
 * register wrote down, arrived at from the other direction.
 *
 * So the right-hand end is pinned and the reason column scrolls. The balance
 * is what this page exists to show - it is the column the owner kept the
 * spreadsheet for - and it was off the right-hand edge on a phone before this.
 *
 * (The DATE column that used to lead this table is gone entirely: a page is
 * one day now, so every row shared it and it belonged in the heading. That
 * bought back about 110px, which is why the middle can afford to scroll.)
 *
 * THE BALANCE AND THE DELETE BUTTON SHARE ONE CELL, and that is not tidiness.
 * As two pinned cells the outer one needs `right: <width of everything right
 * of it>`, which the convention warns about in as many words - and the number
 * was wrong: the action column is 3rem of button plus the `.td` padding, so it
 * renders at 68px, and offsetting the balance by 3rem painted the last 8px of
 * every figure underneath it. `Rs 1,781,910` lost its last digit on a phone
 * and the DOM check said nothing, because the text was not overflowing its own
 * box - another cell was simply on top of it. One cell at `right: 0` has no
 * offset to get wrong.
 *
 * It also keeps the delete button reachable. Pinned alone at `right: 0`, the
 * balance would sit over the action column at every scroll position and the
 * button could never be tapped.
 *
 * Opaque white - a pinned cell that is not lets the row slide through it - and
 * white rather than a tint because, unlike the register's cumulative block,
 * this is not a group of its own; it is the end of an ordinary table that
 * happens to stay put.
 */
const PIN_RIGHT = 'pinned pinned-right';
const BALANCE_PIN = {
  right: 0,
  width: '11rem',
  minWidth: '11rem',
  backgroundColor: '#fff',
};

// The heading's half of the pin wears the heading row's own ground: pinned in
// white, it broke the grey band across the top of the table at "Balance".
const BALANCE_PIN_HEAD = { ...BALANCE_PIN, backgroundColor: 'var(--color-ink-50)' };

/**
 * The cash in the safe on the pump site, drawn - in the new look
 * (docs/UI_CONVENTIONS.md -> "The new look").
 *
 * IT IS THE "TAJORI" SHEET, IN THE SAME ORDER, WITH THE SAME RUNNING BALANCE.
 * The owner read that five-column Excel sheet every day for months, and the
 * app's job is to stop him needing the laptop, not to teach him a new way to
 * look at his own money. What it adds is a balance he can trust because a
 * database computed it, a picture of the week, and a reason on every line.
 */
export default function TreasuryView({ days, askedFor, overview, dayPage, bankAccounts = [] }) {
  const balance = Number(overview?.balance ?? 0);
  const daily = overview?.daily ?? [];

  const entries = dayPage?.entries ?? [];
  const day = dayPage?.day ?? null;
  const dayOpening = Number(dayPage?.opening ?? 0);
  const dayIn = Number(dayPage?.cash_in ?? 0);
  const dayOut = Number(dayPage?.cash_out ?? 0);
  const dayClosing = Number(dayPage?.closing ?? 0);

  // Asked for one day and landed on another - because the day asked for has
  // nothing on it. Said out loud rather than silently showing a different day.
  const landedElsewhere = askedFor !== null && day !== null && askedFor !== day;

  /*
   * The sparkline is the safe's closing balance day by day - the same series
   * the chart's line draws. Its readouts are formatted HERE, on the server: a
   * formatter does not cross the server/client boundary.
   */
  const spark = daily.map((row) => Number(row.closing ?? 0));
  const sparkTips = daily.map((row) => ({ v: formatPKR(row.closing), d: formatDate(row.day) }));

  const outByCategory = (overview?.out_by_category ?? []).map((row) => [
    treasuryCategoryLabel('out', row.category),
    Number(row.amount ?? 0),
  ]);
  const inByCategory = (overview?.in_by_category ?? []).map((row) => [
    treasuryCategoryLabel('in', row.category),
    Number(row.amount ?? 0),
  ]);

  const windowIn = Number(overview?.window_in ?? 0);
  const windowOut = Number(overview?.window_out ?? 0);

  /*
   * "14 days to 21 Aug 2026", not "over the last 14 days". The window ends at
   * the LAST ENTRY rather than at today (migration 046), so on a day nothing
   * has been written down yet "the last 14 days" would be describing a window
   * that had quietly stopped moving.
   */
  const windowLabel = overview?.window_to
    ? `${days} days to ${formatDate(overview.window_to)}`
    : `Over the last ${days} days`;

  /* The chart's window control and the day being read share a URL, so each has
     to carry the other's parameter or pressing one would silently reset the
     other. */
  const hrefWith = (next = {}) => {
    const query = new URLSearchParams({
      days: String(days),
      ...(day ? { date: day } : {}),
      ...next,
    });
    return `/admin/treasury?${query.toString()}`;
  };

  const isEmpty = Number(overview?.entry_count ?? 0) === 0;

  return (
    <>
      <TitleHeader
        title="Treasury"
        icon="treasury"
        tone="held"
        description="The cash kept in the safe on site: what came in, what went out, what is left."
      >
        {/* The one thing this page is opened to do, so it is the one button in
            the header rather than a form competing with the table for width. */}
        {isEmpty ? null : (
          <>
            <TreasuryEntryForm balance={balance} linkDeposits={bankAccounts.length > 0} />
            {/* Cash to the bank is one entry that does both halves (805). */}
            <DepositToBankForm accounts={bankAccounts} idPrefix="treasury_deposit" />
          </>
        )}
      </TitleHeader>

      {isEmpty ? (
        <div className="mt-5">
          <EmptyState
            icon="treasury"
            title="Nothing in the safe yet"
            description="Record what the safe already holds as “Already in the safe”, then add each movement as it happens. Every line after that carries the balance with it."
          >
            <TreasuryEntryForm balance={0} trigger="empty" />
          </EmptyState>
        </div>
      ) : (
        <>
          <section aria-label="The safe at a glance" className="mt-5">
            <KpiGrid>
              <KpiCard
                label="In the safe now"
                icon="treasury"
                tone="held"
                value={formatPKR(balance)}
                sub={overview?.window_to ? `At the close of ${formatDate(overview.window_to)}` : null}
                alert={balance < 0 ? 'Below zero: more went out than came in' : null}
                spark={spark.length > 1 ? spark : undefined}
                sparkTips={spark.length > 1 ? sparkTips : undefined}
              />
              <KpiCard
                label="Cash in"
                icon="moneyIn"
                tone="money"
                value={formatPKR(windowIn)}
                sub={windowLabel}
              />
              <KpiCard
                label="Cash out"
                icon="moneyOut"
                tone="neutral"
                value={formatPKR(windowOut)}
                sub={windowLabel}
              />
              <KpiCard
                label="Entries recorded"
                icon="list"
                tone="neutral"
                value={formatNumber(overview?.entry_count ?? 0)}
                sub={overview?.first_date ? `Since ${formatDate(overview.first_date)}` : null}
              />
            </KpiGrid>
          </section>

          {/* ================= day by day ================= */}
          <section aria-labelledby="trend-heading" className="@container mt-12">
            <SectionHeader
              id="trend-heading"
              icon="reports"
              tone="held"
              title="Day by day"
              description="What went in, what came out, and what the safe was left holding each evening."
            >
              {/* Keeps the reader where they are (`scroll={false}` inside):
                  only the chart and the breakdowns change. */}
              <TrendWindow days={days} hrefFor={(window) => hrefWith({ days: String(window) })} />
            </SectionHeader>

            <div data-card className="panel min-w-0 p-5">
              <TreasuryBalanceChart daily={daily} />
            </div>

            {/* Two breakdowns rather than one, because the safe has two stories
                and only one of them is the usual "where did it go". Where the
                cash CAME FROM is the check on whether the day's takings are
                actually reaching the safe. One height for the pair (the
                grid's own stretch, no `items-start`): a one-line "came from"
                beside a longer "went" stopped short and looked unfinished. */}
            {outByCategory.length > 0 || inByCategory.length > 0 ? (
              <div className="mt-5 grid gap-5 @[48rem]:grid-cols-2 [&>*]:min-w-0">
                {inByCategory.length > 0 ? (
                  <CategoryBreakdown title="Where it came from" rows={inByCategory} total={windowIn} />
                ) : null}
                {outByCategory.length > 0 ? (
                  <CategoryBreakdown title="Where it went" rows={outByCategory} total={windowOut} />
                ) : null}
              </div>
            ) : null}
          </section>

          {/* ================= one day of the sheet ================= */}
          {/* The table gets the whole page: five columns, three of them money
              that must not wrap, is more than the 1fr track of a
              form-beside-a-table split can hold once the window is anything
              short of the 1360px cap. */}
          <section aria-labelledby="day-heading" className="@container mt-12">
            {/* The day IS the heading, because the day is the page. Every row
                below shares it, which is exactly why it is no longer a column. */}
            <SectionHeader
              id="day-heading"
              icon="date"
              tone="neutral"
              title={day ? formatDate(day) : 'Entries'}
              description={`${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} on this day`}
            />

            {/* Picked a day with nothing on it and landed on the nearest one
                that has something. Said out loud - a page that quietly shows a
                different day than the one asked for will be misread as it. */}
            {landedElsewhere ? (
              <Notice tone="info" className="mb-4">
                Nothing was recorded on{' '}
                <span className="font-semibold">{formatDate(askedFor)}</span>. This is the nearest
                day before it that has entries.
              </Notice>
            ) : null}

            {/* WHAT THE DAY OPENED AND CLOSED ON: the number the owner actually
                checks - he counts the notes in the safe at the end of the
                evening and compares. Opening and closing in the ink of the
                balance column they belong to; the two movements keep the green
                and amber they wear everywhere else, and an arrow each. One per
                row below 22rem of section: two across at 360px clipped
                "Rs 2,151,910", measured. */}
            <dl className="mb-4 grid grid-cols-1 gap-3 @[22rem]:grid-cols-2 @[44rem]:grid-cols-4">
              <DayFigure label="Opened with" value={formatPKR(dayOpening)} />
              <DayFigure label="Cash in" value={formatPKR(dayIn)} tone="in" />
              <DayFigure label="Cash out" value={formatPKR(dayOut)} tone="out" />
              <DayFigure
                label="Closed at"
                value={formatPKR(dayClosing)}
                tone="close"
                negative={dayClosing < 0}
              />
            </dl>

            {entries.length === 0 ? (
              <EmptyState
                icon="treasury"
                title="Nothing recorded on this day"
                description="Use Record cash to add the first entry."
              />
            ) : (
              /* 43rem is the sum of what the four columns actually need,
                 measured: at 36rem the browser took the shortfall out of the
                 nowrap money cells and clipped "Rs 135,000" to "Rs 135,0". */
              <div data-card className="panel overflow-hidden">
                <div className="table-scroll has-pinned-columns mx-0">
                  <table className="w-full min-w-[43rem]">
                    <thead>
                      <tr>
                        <th className="th pl-5">What for</th>
                        <th className="th text-right">In</th>
                        <th className="th text-right">Out</th>
                        {/* No pr-5 on the pinned cells: the block is a measured 11rem, and 8px
                            more padding comes out of the balance beside its
                            delete button. */}
                        <th className={`th text-right ${PIN_RIGHT}`} style={BALANCE_PIN_HEAD}>
                          Balance
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100">
                      {entries.map((entry) => {
                        const isIn = entry.direction === 'in';
                        const label = treasuryCategoryLabel(entry.direction, entry.category);
                        const balanceAfter = Number(entry.balance_after ?? 0);

                        return (
                          <tr key={entry.id}>
                            <td className="td pl-5">
                              <span className="font-medium text-ink-900">{label}</span>
                              {/* The owner's own words, under the reason he
                                  picked. Left to wrap - "Munir sb by Hamza
                                  saqib for sylage" is a real line, and
                                  truncating it would lose the only part that
                                  says who is holding the money. */}
                              {entry.details ? (
                                <span className="mt-0.5 block max-w-[48ch] text-sm text-ink-700 [overflow-wrap:anywhere]">
                                  {entry.details}
                                </span>
                              ) : null}
                            </td>
                            {/* The arrow is the second cue beside the colour:
                                green against amber alone is what a colourblind
                                reader cannot use. */}
                            <td className="td-num font-semibold text-brand-700">
                              {isIn ? (
                                <span className="inline-flex items-center justify-end gap-1.5">
                                  <Icon name="moneyIn" className="h-4 w-4" />
                                  {formatPKR(entry.amount)}
                                </span>
                              ) : null}
                            </td>
                            <td className="td-num font-semibold text-amber-800">
                              {isIn ? null : (
                                <span className="inline-flex items-center justify-end gap-1.5">
                                  <Icon name="moneyOut" className="h-4 w-4" />
                                  {formatPKR(entry.amount)}
                                </span>
                              )}
                            </td>
                            {/* The column the sheet was really kept for, in ink
                                rather than either movement colour: it is not
                                money arriving or leaving, it is what was there
                                afterwards. */}
                            <td className={`td-num ${PIN_RIGHT}`} style={BALANCE_PIN}>
                              <span className="flex items-center justify-end gap-1">
                                <span
                                  className={`font-bold ${
                                    balanceAfter < 0 ? 'text-red-700' : 'text-ink-900'
                                  }`}
                                >
                                  {formatPKR(balanceAfter)}
                                </span>
                                <DeleteTreasuryEntryButton
                                  entryId={entry.id}
                                  summary={`${formatPKR(entry.amount)} ${
                                    isIn ? 'in' : 'out'
                                  } on ${formatDate(entry.entry_date)}`}
                                  bankDeposit={entry.category === 'bank_deposit'}
                                />
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <TreasuryDayNav
              day={day}
              prevDay={dayPage?.prev_day ?? null}
              nextDay={dayPage?.next_day ?? null}
              dayIndex={Number(dayPage?.day_index ?? 0)}
              dayCount={Number(dayPage?.day_count ?? 0)}
              hrefForDay={(date) => hrefWith({ date })}
              carried={{ days: String(days) }}
            />
          </section>
        </>
      )}
    </>
  );
}

/*
 * One of the day's four figures. Sentence-case captions at 14px (they were 12px
 * capitals); the two movements wear green and amber with their arrow, the
 * opening and closing the ink of the balance column.
 */
function DayFigure({ label, value, tone, negative = false }) {
  const style = {
    in: { box: 'bg-brand-50 ring-brand-100', caption: 'text-brand-800', figure: 'text-brand-800', icon: 'moneyIn' },
    out: { box: 'bg-amber-50 ring-amber-100', caption: 'text-amber-900', figure: 'text-amber-900', icon: 'moneyOut' },
    close: { box: 'bg-ink-50 ring-ink-300', caption: 'text-ink-700', figure: 'text-ink-900', icon: null },
  }[tone] ?? { box: 'bg-white ring-ink-200', caption: 'text-ink-600', figure: 'text-ink-900', icon: null };

  return (
    <div className={`rounded-xl px-3.5 py-2.5 ring-1 ring-inset ${style.box}`}>
      <dt className={`flex items-center gap-1.5 text-sm font-medium ${style.caption}`}>
        {style.icon ? <Icon name={style.icon} className="h-4 w-4" /> : null}
        {label}
      </dt>
      <dd
        className={`tabular mt-0.5 whitespace-nowrap text-lg font-bold ${
          negative ? 'text-red-700' : style.figure
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
