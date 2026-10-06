import { formatDate, formatPKR, formatLitres } from '@/app/_lib/helpers';
import EmptyState from '@/app/_components/ui/EmptyState';
import FuelBadge from '@/app/_components/ui/FuelBadge';
import CorrectEntryButton from '@/app/_components/admin/CorrectEntryButton';

/**
 * One page of the ledger, newest first, with a running balance.
 *
 * Each row shows what was owed immediately after that entry - which is how a
 * paper khata reads.
 *
 * THE RUNNING BALANCE COMES FROM POSTGRES (`balance_after`, migration 064) and
 * is not worked out here, which it used to be: sort the rows oldest first, run
 * a total through them starting at zero. That was right while this table was
 * handed the WHOLE ledger, and wrong from the day it was handed a page of 25 -
 * zero is the balance before the customer's first ever entry, and that entry is
 * on the LAST page. Every figure in the column was out by the net of everything
 * older than the page; a customer owing Rs 97,515 read Rs -59,728 against his
 * newest entry, which is not just the wrong number but the wrong side of zero.
 * The card above the table and the printed statement were right throughout, so
 * the only thing broken was the column you would check them against - and that
 * is the one that has to be right, because it is where the owner looks when he
 * wants to know where a figure came from.
 *
 * It is summed over every row the customer has, so a row reads the same on
 * whichever page it falls, and the newest row equals the balance on the card.
 *
 * A CANCELLED ROW STAYS ON THE PAGE, STRUCK THROUGH. Nothing is ever deleted
 * here (the database refuses), so a corrected mistake leaves three rows: the
 * wrong one, the entry that cancelled it, and the replacement. Shown plainly
 * that is unreadable - three amounts, two of them meaningless, and no way to
 * tell which. So the cancelled row is struck and greyed and the cancelling row
 * is labelled, and the pair reads as one crossed-out line the way it would in a
 * register. The figures are still there to be checked; they have simply stopped
 * claiming to be live.
 *
 * BOTH ROWS KEEP THEIR PLACE IN THE RUNNING BALANCE. It would look tidier to
 * skip them, and it would be wrong: the balance column says what was owed after
 * each entry, and on the day between the mistake and its correction that really
 * was the figure. Striking the row says it is not the last word; removing it
 * from the arithmetic would make the column stop adding up.
 */
export default function CustomerLedgerTable({
  entries,
  correctedIds = [],
  customerId,
  balance = 0,
  canCorrect = false,
  vehicleNames = {},
}) {
  if (entries.length === 0) {
    return (
      <EmptyState
        icon="list"
        title="Nothing recorded yet"
        description="Credit slips appear here automatically once a reading with this customer is saved. Payments are recorded with the button above."
      />
    );
  }

  const cancelled = new Set(correctedIds);

  // Already newest first, and already ordered by the same triple the running
  // balance was summed along - see migration 064. Re-sorting here would be the
  // way the two quietly come apart.
  const newestFirst = entries;

  return (
    <div data-card className="panel overflow-hidden">
      <div className="table-scroll mx-0 px-0">
        <table className="w-full min-w-[40rem]">
          <thead>
            <tr>
              <th className="th pl-5">Date</th>
              {/* A floor under Detail below 1024px, where the table scrolls
                  anyway (a phone): squeezed by columns that never wrap it held
                  one or two words a line, a row five lines deep. None from
                  1024 up, where the floor would make the table scroll beside
                  a pinned sidebar. The figure headings stay on one line. */}
              <th className="th min-w-[13rem] lg:min-w-0">Detail</th>
              <th className="th whitespace-nowrap text-right">Fuel taken</th>
              <th className="th whitespace-nowrap text-right">Paid</th>
              <th className={`th whitespace-nowrap text-right ${canCorrect ? '' : 'pr-5'}`}>
                Balance
              </th>
              {canCorrect ? (
                <th className="th pr-5 text-right">
                  <span className="sr-only">Correct</span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {newestFirst.map((entry) => {
              const isDebit = entry.entry_type === 'debit';
              const isCancelled = cancelled.has(entry.id);
              const isReversal = Boolean(entry.corrects_entry_id);
              // Posted by a reading or a lubricant sale, so the sale is where it
              // gets fixed - the database says the same thing if asked anyway.
              const isAuto = Boolean(entry.credit_sale_id || entry.lubricant_sale_id);
              const correctable = canCorrect && !isCancelled && !isReversal && !isAuto;

              return (
                <tr key={entry.id} className={isCancelled ? 'bg-ink-50/60 text-ink-600' : undefined}>
                  <td className="td whitespace-nowrap pl-5 font-semibold">
                    {formatDate(entry.entry_date)}
                  </td>
                  <td className="td">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={isCancelled ? 'line-through' : undefined}>
                        {entry.note ?? (isDebit ? 'Fuel on credit' : 'Payment')}
                      </span>
                      {entry.fuel_type ? <FuelBadge fuelType={entry.fuel_type} /> : null}
                      {/* Which vehicle on the account took it (801). The
                          number, never colour alone, so it reads in any light. */}
                      {entry.vehicle_id && vehicleNames[entry.vehicle_id] ? (
                        <span className="badge whitespace-nowrap bg-violet-100 font-semibold text-violet-800">
                          {vehicleNames[entry.vehicle_id]}
                        </span>
                      ) : null}
                      {/* Both auto sources wear the badge, not just readings.
                          A lubricant sale posts here the same way and is
                          equally not correctable from this page - leaving it
                          unbadged made it the one row with no pencil and no
                          reason given. */}
                      {isAuto ? (
                        <span
                          className="badge bg-ink-100 text-ink-700"
                          title={
                            entry.credit_sale_id
                              ? 'Posted automatically from a nozzle reading'
                              : 'Posted automatically from a lubricant sale'
                          }
                        >
                          Auto
                        </span>
                      ) : null}
                      {/* THE WORD, NOT JUST THE STRIKETHROUGH. A line through a
                          number is easy to miss on a tablet in poor light, and
                          it is the one thing on this row that changes what it
                          means. Colour and a line are both decoration; this is
                          the statement. */}
                      {isCancelled ? (
                        <span
                          className="badge bg-amber-100 text-amber-900"
                          title="This entry was entered in error and has been cancelled"
                        >
                          Cancelled
                        </span>
                      ) : null}
                      {isReversal ? (
                        <span
                          className="badge bg-ink-100 text-ink-700"
                          title="Posted to cancel an earlier entry"
                        >
                          Correction
                        </span>
                      ) : null}
                    </div>
                    {entry.litres ? (
                      <span className="tabular mt-0.5 block text-sm text-ink-600">
                        {formatLitres(entry.litres)}
                      </span>
                    ) : null}
                  </td>
                  {/* The other column of the pair is left BLANK, the way a
                      ledger book leaves it: it was a dash, and the page carries
                      no dashes. Cancelled rows are faded to ink-600, the
                      contrast floor, not below it - struck through, they still
                      have to be read. */}
                  <td
                    className={`td-num ${isCancelled ? 'text-ink-600 line-through' : 'text-red-700'}`}
                  >
                    {isDebit ? formatPKR(entry.amount) : null}
                  </td>
                  <td
                    className={`td-num ${isCancelled ? 'text-ink-600 line-through' : 'text-brand-700'}`}
                  >
                    {isDebit ? null : formatPKR(entry.amount)}
                  </td>
                  <td
                    className={`td-num font-bold ${isCancelled ? 'text-ink-600' : 'text-ink-900'} ${
                      canCorrect ? '' : 'pr-5'
                    }`}
                  >
                    {formatPKR(entry.balance_after)}
                  </td>
                  {canCorrect ? (
                    <td className="td pr-5 text-right">
                      {correctable ? (
                        <CorrectEntryButton
                          entry={entry}
                          customerId={customerId}
                          balance={balance}
                        />
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
