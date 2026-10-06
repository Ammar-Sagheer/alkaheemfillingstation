'use client';

import { formatPKR, formatLitres } from '@/app/_lib/format-helpers';
import { formatDate } from '@/app/_lib/date-helpers';
import FuelBadge from '@/app/_components/ui/FuelBadge';
import EmptyState from '@/app/_components/ui/EmptyState';

/**
 * The statement, on screen, exactly as it will print.
 *
 * WHY IT EXISTS. The first version of this feature was a button that produced a
 * file, and the only way to find out what was on the file was to open it. That
 * is a poor loop for a document you are about to hand to someone and ask them
 * for money - and it is how a wrong statement got as far as being printed: the
 * lines said Rs 12,000 and the total said Rs 10,100, and nothing on screen was
 * ever going to show that, because the screen was not showing the statement.
 *
 * So the figures are checked here first, on the page where the reader already
 * trusts what he is looking at, and the PDF is the thing you reach for once they
 * are right.
 *
 * IT SHARES THE ARITHMETIC RATHER THAN REPEATING IT. `accountFromParts` in
 * customer-statement.js produces what this renders and what the PDF renders,
 * from rows the server prepared once. A preview that computes its own figures is
 * worse than none: it agrees with the file right up until the day it quietly
 * stops.
 *
 * THE SAME FIVE COLUMNS AS THE LEDGER UNDERNEATH - date, detail, fuel taken,
 * paid, balance - and that is the point rather than a saving. The owner reads a
 * figure here, looks down at the transaction history on the same page to see
 * where it came from, and the two now agree row for row. The statement this
 * replaced could not be checked that way: it listed only unpaid fills, each
 * carrying a "paid off" figure produced by spreading payments over fills
 * oldest-first, and those figures appeared nowhere in the ledger. See
 * customer-statement.js for the Rs 4,980 that ended that design.
 *
 * Deliberately NOT a picture of the A4 page. A preview that mimics the paper is
 * unreadable on a phone and invites the reader to check the layout instead of
 * the numbers. This is the same information in this app's own idiom - the table
 * classes the ledger below it already uses - so it can be read at a glance on a
 * tablet.
 */
export default function StatementPreview({ statement, customerName }) {
  const {
    rows,
    opening,
    openingCount,
    openingFrom,
    fuelTaken,
    paid,
    corrections,
    totalDue,
    discrepancy,
    settled,
    inCredit,
    lastPayment,
    from,
    to,
    asAt,
    isCurrent,
    empty,
  } = statement;

  if (empty) {
    return (
      <EmptyState
        icon="list"
        title="Nothing on this account yet"
        description="No fuel has been taken on credit and no payment has been recorded, so there is nothing to put on a statement."
      />
    );
  }

  /*
   * WHAT THE BIG FIGURE IS CALLED, WHICH IS NOT ALWAYS "TOTAL NOW DUE". Ask for a
   * period that ends in the past and the closing figure is the balance as it
   * stood then; entries since are real and are not on the page. Calling that
   * "total now due" would ask for the wrong money in the largest type on the
   * sheet. Same wording as the PDF's `totalLabel` - the owner should recognise
   * the document he is about to hand over.
   */
  const label = !isCurrent
    ? `Balance as at ${formatDate(asAt)}`
    : inCredit
      ? 'In credit'
      : settled
        ? 'Nothing outstanding'
        : 'Total now due';

  const covering =
    from && to
      ? `The account from ${formatDate(from)} to ${formatDate(to)}`
      : from
        ? `The account from ${formatDate(from)} onwards`
        : to
          ? `The account up to ${formatDate(to)}`
          : 'The account in full';

  return (
    <div className="space-y-4">
      {/* ---- the answer, before the working ---- */}
      <div
        className={`flex flex-wrap items-end justify-between gap-x-6 gap-y-2 rounded-2xl px-4 py-3 ${
          settled ? 'bg-brand-50' : 'bg-red-50'
        }`}
      >
        <div>
          <p className={`text-sm font-semibold ${settled ? 'text-brand-800' : 'text-red-800'}`}>
            {label}
          </p>
          <p
            className={`tabular text-3xl font-bold ${settled ? 'text-brand-800' : 'text-red-800'}`}
          >
            {formatPKR(inCredit ? -totalDue : totalDue)}
          </p>
        </div>
        <p className="text-sm text-ink-600">
          {lastPayment
            ? `Last payment ${formatPKR(lastPayment.amount)} on ${formatDate(lastPayment.date)}`
            : 'No payment recorded yet'}
        </p>
      </div>

      {/* ---- the account ---- */}
      <div>
        <p className="mb-2 text-base font-semibold text-ink-800">{covering}</p>

        {/* A bordered box rather than a lifted panel: it sits inside a dialog,
            which is already the surface. */}
        <div className="overflow-hidden rounded-2xl border border-ink-200">
          <div className="table-scroll mx-0 px-0">
            <table className="w-full min-w-[36rem]">
              <thead className="border-b border-ink-200 bg-ink-50">
                <tr>
                  <th className="th">Date</th>
                  <th className="th">Detail</th>
                  <th className="th text-right">Fuel taken</th>
                  <th className="th text-right">Paid</th>
                  <th className="th text-right">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {/* THE OPENING LINE IS WHAT KEEPS A SHORTENED STATEMENT HONEST.
                    Without it "last 30 days" prints a column that cannot reach the
                    total at the foot, and the first customer to add it up has a
                    grievance. It spans the first four columns because there is
                    nothing to put in the money columns on this row and, given a
                    cell of its own, the text wraps onto three lines on a phone. */}
                {openingCount > 0 ? (
                  <tr className="bg-ink-50">
                    <td className="td whitespace-nowrap">{formatDate(from)}</td>
                    <td className="td" colSpan={3}>
                      <span className="font-bold">Balance brought forward</span>
                      <span className="mt-0.5 block text-sm text-ink-600">
                        {openingCount} earlier {openingCount === 1 ? 'entry' : 'entries'}, from{' '}
                        {formatDate(openingFrom)}
                      </span>
                    </td>
                    <td className="td-num font-bold">{formatPKR(opening)}</td>
                  </tr>
                ) : null}

                {rows.map((row) => {
                  const struck = row.cancelled;
                  return (
                    <tr
                      key={row.id}
                      className={struck ? 'bg-ink-50/60 text-ink-600' : undefined}
                    >
                      <td className="td whitespace-nowrap">{formatDate(row.date)}</td>
                      <td className="td">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={struck ? 'line-through' : undefined}>{row.detail}</span>
                          {row.fuelType ? <FuelBadge fuelType={row.fuelType} /> : null}
                          {/* THE WORD, NOT JUST THE STRIKETHROUGH - and not just the
                              colour. This page gets photocopied and read on a
                              tablet in poor light, and whether a line is money or
                              the undoing of money is the one thing on it that
                              changes what the column means. */}
                          {row.cancelled ? (
                            <span
                              className="badge bg-amber-100 text-amber-900"
                              title="This entry was put right by the correction below it"
                            >
                              Cancelled
                            </span>
                          ) : null}
                          {row.reversal ? (
                            <span
                              className="badge bg-ink-100 text-ink-700"
                              title="Posted to cancel an earlier entry - it is in the balance but it is not money taken or paid"
                            >
                              Correction
                            </span>
                          ) : null}
                        </div>
                        {row.litres ? (
                          <span className="tabular mt-0.5 block text-sm text-ink-600">
                            {formatLitres(row.litres)}
                          </span>
                        ) : null}
                      </td>
                      <td
                        className={`td-num ${
                          struck ? 'text-ink-600 line-through' : 'text-red-700'
                        }`}
                      >
                        {/* Blank, the way a ledger leaves the other column. */}
                        {row.debit ? formatPKR(row.debit) : null}
                      </td>
                      <td
                        className={`td-num ${
                          struck ? 'text-ink-600 line-through' : 'text-brand-700'
                        }`}
                      >
                        {row.credit ? formatPKR(row.credit) : null}
                      </td>
                      <td className="td-num font-bold">
                        {row.balance === null ? null : formatPKR(row.balance)}
                      </td>
                    </tr>
                  );
                })}

                {/* ---- the footer: what the period did to the balance ---- */}
                <tr className="border-t-2 border-ink-200 bg-ink-50">
                  <td className="td font-bold" colSpan={2}>
                    {from || to ? 'In this period' : 'In total'}
                  </td>
                  <td className="td-num font-bold text-red-700">{formatPKR(fuelTaken)}</td>
                  <td className="td-num font-bold text-brand-700">{formatPKR(paid)}</td>
                  <td className="td-num" />
                </tr>

                {/* Zero whenever both halves of a corrected pair are on the page,
                    which is nearly always - it shows when a reversal's partner is
                    older than the window, so the column still reaches the total. */}
                {Math.abs(corrections) >= 0.5 ? (
                  <tr>
                    <td className="td text-ink-600" colSpan={4}>
                      Corrections in this period
                    </td>
                    <td className="td-num font-bold">{formatPKR(corrections)}</td>
                  </tr>
                ) : null}

                {/* Zero on every statement this can produce - it is here because it
                    was once not zero and nothing said so. */}
                {discrepancy ? (
                  <tr>
                    <td className="td text-ink-600" colSpan={4}>
                      Other movements on the account
                    </td>
                    <td className="td-num font-bold">{formatPKR(discrepancy)}</td>
                  </tr>
                ) : null}

                <tr className={settled ? 'bg-brand-50' : 'bg-red-50'}>
                  <td
                    className={`td whitespace-nowrap font-bold ${
                      settled ? 'text-brand-800' : 'text-red-800'
                    }`}
                    colSpan={4}
                  >
                    {label}
                  </td>
                  <td
                    className={`td-num text-base font-bold ${
                      settled ? 'text-brand-800' : 'text-red-800'
                    }`}
                  >
                    {formatPKR(inCredit ? -totalDue : totalDue)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <p className="text-sm text-ink-600">
        {settled
          ? `Every fill on this account has been paid for. ${customerName} is asked for nothing.`
          : isCurrent
            ? `Every fill and every payment is listed above, oldest first, with what was owed after each. ${customerName} is asked for ${formatPKR(totalDue)}.`
            : `This statement stops at ${formatDate(asAt)} and closes with what was owed then, not with what is owed today. Anything after that date is not on it.`}
      </p>
    </div>
  );
}
