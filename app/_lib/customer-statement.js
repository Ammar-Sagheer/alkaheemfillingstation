/**
 * The statement of account: everything on a customer's ledger, and what it
 * comes to.
 *
 * THE PROBLEM THIS SOLVES. The customer page shows one figure - "currently owes
 * Rs 97,515" - and the ledger under it is paged. Neither is what you hand a
 * haulier when you go to collect. He will not accept a bare total, and he cannot
 * read a screen you are holding: he wants the account, every fill he took and
 * every rupee he paid, in order, so he can put it beside his own book and tick
 * down the two together.
 *
 * WHAT THIS USED TO BE, AND WHY IT CHANGED. The first version was an OPEN-ITEM
 * statement - the other standard shape, and on paper the better collecting
 * document. It listed only the fills still unpaid, each showing how much of it
 * had been covered, because payments were applied oldest-first: a convention, not
 * a fact, since nothing in `ledger_entries` says which payment settled which
 * fill. The arithmetic was right and the total always matched the balance.
 *
 * It was still the wrong document for this pump, and the owner found out the way
 * these things are always found out - by reading one. A Rs 5,000 fill from 31
 * August printed with "Rs 4,980 paid off, Rs 20 still due", and Rs 4,980 is a
 * number that appears NOWHERE in the ledger: it is the tail of a payment the
 * allocation had spread across four earlier fills. Every figure was defensible
 * and the page was still unusable, because a statement is checked by finding its
 * numbers somewhere else, and these could not be found. The convention had to be
 * explained in a footnote for the document to make sense at all, and a figure
 * that needs a footnote to survive being read is the wrong figure.
 *
 * So this is now a BALANCE-FORWARD statement, which is what the paper khata it
 * replaces always was. Every entry in the period, oldest first, each with the
 * balance standing after it; an opening balance where the period starts part way
 * through the account; a closing total that is the balance itself. Nothing on the
 * page is inferred, allocated or apportioned - every line is a row of the ledger,
 * and the customer can find all of them on the copy he is standing next to.
 *
 * THE RUNNING BALANCE IS NOT COMPUTED HERE. It arrives on the row as
 * `balance_after`, summed in Postgres in exact `numeric` over the WHOLE ledger
 * (migration 064), which is also where the paged table on the customer page gets
 * it. Two reasons, and the second is the one that matters: money the database
 * already sums is not summed again in a double (see CLAUDE.md), and the statement
 * and the screen must agree row for row - the whole point of this rewrite is that
 * the owner can check one against the other.
 *
 * CORRECTIONS ARE SHOWN, NOT HIDDEN, and this is the one place the document has
 * to be careful. There are two ways a row gets undone:
 *
 *   1. A HAND CORRECTION (063) - a reversal carrying `corrects_entry_id`, naming
 *      the row it cancels, usually with a replacement beside it.
 *   2. A DELETED SALE (014, 015, 024) - deleting a reading or a lubricant sale
 *      posts a plain credit for the slip's amount, on the slip's own date, with a
 *      note beginning "Reversal - ". The original debit stays on the ledger by
 *      design: *"deleting a reading reverses its credit slips, it does not erase
 *      them"*.
 *
 * Both kinds stay on the statement, because the balance column would otherwise
 * jump by an amount with no line against it, and because this ledger does not
 * pretend things did not happen. What they must NOT do is read as money. The
 * second kind is why "Total received" once told a customer he had paid Rs 35,501
 * when he had handed over Rs 30,500 - a deleted 10 Aug reading had put a Rs 5,001
 * credit on the ledger and the statement counted it as a payment. On a page you
 * give to the person you are asking to pay, that is a receipt for money he never
 * paid. So a correction is marked as one, and it is kept out of both period
 * totals; only the balance column carries it.
 *
 * MATCHED ON DATE AND AMOUNT, for the second kind, because that is all there is:
 * the reversal is written with `cs.amount` and the slip's own date, and the
 * credit_sale row it came from is deleted in the same statement, so no id
 * survives to join on. The note prefix is the discriminator and Postgres
 * generates it - nobody types it. A reversal that finds no partner is still
 * treated as a correction rather than a payment: it is the safer half of the
 * guess, since counting it as money received is the error that costs real rupees.
 *
 * No imports beyond the money helpers: this is arithmetic over rows, called from
 * a page, a route handler and the browser alike. Formatting belongs to the caller.
 */
import { sumMoney } from './format-helpers';

/** Plain calendar-date arithmetic, in UTC, so no timezone can nudge a day. */
function dayNumber(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

/** Whole days from `iso` up to `asOf`. Same day is 0, not 1 - this is an age. */
function ageInDays(iso, asOf) {
  return Math.max(0, dayNumber(asOf) - dayNumber(iso));
}

/** `days` back from an ISO date, in UTC, for the same reason as dayNumber. */
function isoDaysBefore(iso, days) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - days);
  return dt.toISOString().slice(0, 10);
}

/**
 * Oldest first, and stable.
 *
 * The same triple migration 064 sums the running balance along - `entry_date`,
 * then `created_at`, then `id`. It has to be the same one: a correction writes
 * its reversal and its replacement in a single statement, so both carry the
 * identical `created_at`, and two different orderings of that pair would put a
 * balance on the row above the line that explains it.
 */
function oldestFirst(entries) {
  return [...entries].sort((a, b) => {
    if (a.entry_date !== b.entry_date) return a.entry_date < b.entry_date ? -1 : 1;
    if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
    return String(a.id) < String(b.id) ? -1 : 1;
  });
}

/** What a row is called on the statement when nobody wrote a note. */
function describe(entry) {
  if (entry.note && entry.note.trim()) return entry.note.trim();
  return entry.entry_type === 'debit' ? 'Fuel on credit' : 'Payment received';
}

/** Postgres writes this prefix on a reversal; nobody types it. See 014/015/024. */
const REVERSAL_NOTE = /^Reversal - /;

/**
 * The ids of every row that has been undone, and of every row that did the
 * undoing.
 *
 * Both halves of both kinds of pair - see the header. The pair nets to zero by
 * construction, so taking both out of the period totals leaves those totals
 * saying what actually happened, and leaves the closing balance exactly where it
 * was.
 */
function cancelledPairIds(entries) {
  const cancelled = new Set();

  // 1. Hand corrections, by the column that exists for exactly this.
  for (const entry of entries) {
    if (entry.corrects_entry_id) {
      cancelled.add(entry.id);
      cancelled.add(entry.corrects_entry_id);
    }
  }

  // 2. Deleted sales, by date and amount, oldest first so two reversals of the
  //    same amount on the same day take one debit each rather than both taking
  //    the first.
  const ordered = oldestFirst(entries);
  const debits = ordered.filter(
    (entry) => entry.entry_type === 'debit' && !cancelled.has(entry.id),
  );

  for (const entry of ordered) {
    if (entry.entry_type !== 'credit') continue;
    if (cancelled.has(entry.id)) continue;
    if (!REVERSAL_NOTE.test(entry.note ?? '')) continue;

    const partner = debits.find(
      (debit) =>
        !cancelled.has(debit.id) &&
        debit.entry_date === entry.entry_date &&
        Math.abs(Number(debit.amount) - Number(entry.amount)) < 0.005,
    );

    if (partner) {
      cancelled.add(entry.id);
      cancelled.add(partner.id);
    }
  }

  return cancelled;
}

/**
 * The ledger, turned into statement rows - once, on the server.
 *
 * SPLIT OUT FROM THE WINDOWING SO THE SCREEN AND THE PDF CANNOT DRIFT. The
 * customer page previews the statement before printing it and the reader changes
 * the day range in a dialog, which must not mean a server round trip per click
 * and must REALLY not mean a second implementation of the windowing in the client
 * component. So this, which needs the whole ledger, runs once on the server;
 * `accountFromParts` below, which is pure and cheap, runs again in the browser on
 * every range change and once more inside the download route. One code path,
 * three callers - and everything here is serialisable, which is what lets the
 * result cross the server/client boundary as a prop.
 */
export function prepareAccountRows(entries) {
  const cancelled = cancelledPairIds(entries);

  return oldestFirst(entries).map((entry) => {
    const amount = Number(entry.amount ?? 0);
    const isDebit = entry.entry_type === 'debit';

    /*
     * A REVERSAL is a row written to undo another - either kind, and whether or
     * not its partner was found. A CORRECTION is either half of such a pair. Both
     * are kept out of the period totals; only the balance column carries them.
     */
    const isReversal =
      Boolean(entry.corrects_entry_id) || (!isDebit && REVERSAL_NOTE.test(entry.note ?? ''));
    const isCorrection = cancelled.has(entry.id) || isReversal;

    return {
      id: entry.id,
      date: entry.entry_date,
      detail: describe(entry),
      fuelType: entry.fuel_type ?? null,
      litres: entry.litres === null || entry.litres === undefined ? null : Number(entry.litres),
      debit: isDebit ? amount : 0,
      credit: isDebit ? 0 : amount,

      /*
       * From Postgres, never added up here - see the header. Absent only if a
       * caller hands over rows that did not come through get_ledger_entries_*,
       * and null rather than zero so that reads as "no figure" instead of as a
       * cleared account.
       */
      balance: entry.balance_after === null || entry.balance_after === undefined
        ? null
        : Number(entry.balance_after),

      kind: isCorrection ? 'correction' : isDebit ? 'fill' : 'payment',

      /*
       * The two halves of a pair read differently and must be labelled
       * differently: one row is the mistake, the other is the row that undoes
       * it. One word against both would tell the customer the wrong thing about
       * whichever line he happens to be looking at.
       */
      reversal: isReversal,
      cancelled: isCorrection && !isReversal,
    };
  });
}

/**
 * The windowing half, over rows already prepared.
 *
 * `from` and `to` are inclusive ISO dates and either may be left out: no `from`
 * means the account from its first entry, no `to` means up to today. They narrow
 * what is LISTED, and everything before `from` collapses into one opening balance
 * so the column still runs down to the closing figure. A statement whose lines do
 * not reach its total is worse than no statement; it is an argument waiting to
 * happen.
 *
 * AN END DATE IN THE PAST CHANGES WHAT THE CLOSING FIGURE MEANS, and this is the
 * one thing about a date range that a day count never had to face. "Last 30 days"
 * always ended today, so the closing figure was always what is owed NOW. Ask for
 * 1 to 31 August and it cannot be: entries from September are on the ledger and
 * would have to be either listed (in which case the range was not honoured) or
 * dropped from a total that claims to be current (in which case the page asks for
 * the wrong money). So a statement ending in the past closes with the balance AS
 * AT that date - read off the last row inside the window, a Postgres figure like
 * every other balance here - and says "Balance as at 31 Aug 2026" rather than
 * "Total now due". `isCurrent` is what the renderers switch on.
 *
 * `balance` is passed IN, from `customer_balance()` in Postgres, and is what a
 * statement running up to today prints. The rows reach the same figure from the
 * same ledger, and the two are checked against each other below rather than
 * assumed to agree.
 */
export function accountFromParts(
  { rows = [] },
  { asOf, balance, from = null, to = null } = {},
) {
  const before = from ? rows.filter((row) => row.date < from) : [];
  const after = to ? rows.filter((row) => row.date > to) : [];
  const listed = rows.filter(
    (row) => (!from || row.date >= from) && (!to || row.date <= to),
  );

  /*
   * The opening balance is READ OFF THE LAST ROW BEFORE THE WINDOW rather than
   * added up from the rows behind it - it is a Postgres figure like every other
   * balance on the page, and the one place a JavaScript sum could put the whole
   * column a paisa out from its first line.
   */
  const opening = before.length > 0 ? Number(before[before.length - 1].balance ?? 0) : 0;

  /*
   * Nothing on the ledger after the window means the window still ends at the
   * account's own end, so today's balance IS the closing figure and the database
   * owns it. Otherwise the closing figure is the balance standing at the end of
   * the period, read off the last row inside it.
   */
  const isCurrent = after.length === 0;
  const closingFromRows =
    listed.length > 0 ? Number(listed[listed.length - 1].balance ?? 0) : opening;
  const totalDue = isCurrent ? Number(balance ?? 0) : closingFromRows;

  /*
   * Period totals, in integer paisa - see sumMoney. These are the only figures
   * on the statement this file works out, and they exist because the footer of a
   * statement is where the reader checks that the page adds up:
   *
   *   opening + fuel taken - payments + corrections = closing
   *
   * Corrections are the net of the undone rows and are zero whenever both halves
   * of a pair are on the page, which is nearly always; the footer only shows the
   * line when it is not.
   */
  const fuelTaken = sumMoney(listed.filter((row) => row.kind === 'fill').map((row) => row.debit));
  const paid = sumMoney(listed.filter((row) => row.kind === 'payment').map((row) => row.credit));
  const corrections = sumMoney(
    listed.filter((row) => row.kind === 'correction').map((row) => row.debit - row.credit),
  );

  /*
   * THE ONE THING A STATEMENT HAS TO DO IS ADD UP, so it is checked rather than
   * assumed. The closing figure comes from Postgres and the lines come from the
   * ledger; they are the same rows reached two different ways and must agree.
   *
   * They did not, once, on the open-item statement this replaced - the lines said
   * Rs 12,000 under a total that said Rs 10,100 - and nothing on the page admitted
   * it. A discrepancy is carried out to the renderer, which prints it as its own
   * line rather than letting a column of figures quietly fail to reach its total.
   * Naming it is not as good as not having one, but it is the difference between
   * a document that is wrong and a document that is lying.
   */
  const reached = sumMoney([opening, fuelTaken, -paid, corrections]);
  const discrepancy = Math.abs(reached - totalDue) < 0.5 ? 0 : sumMoney([totalDue, -reached]);

  /*
   * The last real payment, which is the sentence that gets a conversation going:
   * "you last paid on 31 August, thirteen days ago". Read straight off a row, and
   * never one dated after the period: a statement for August must not mention a
   * payment made in September, or it contradicts its own closing figure.
   */
  const payments = rows.filter((row) => row.kind === 'payment' && (!to || row.date <= to));
  const last = payments.length > 0 ? payments[payments.length - 1] : null;

  // The date the document speaks as of: the end of the period, or today.
  const asAt = to ?? asOf;

  return {
    asOf,
    from: from ?? null,
    to: to ?? null,
    asAt,

    /** True while the period runs to the end of the account, so the closing
        figure is what is owed TODAY rather than what was owed then. */
    isCurrent,

    /** Every movement in the period, oldest first - the order a khata reads. */
    rows: listed,

    /** What was owed the moment the period opened, and what sits behind it. */
    opening,
    openingCount: before.length,
    openingFrom: before.length > 0 ? before[0].date : null,

    /** The footer: what the period did to the balance. */
    fuelTaken,
    paid,
    corrections,

    /** What the page is for: owed today, or standing at the end of the period. */
    totalDue,

    /** Non-zero only if the lines fail to reach the total - see above. */
    discrepancy,

    /** Nothing owed - the "all dues cleared" page. */
    settled: totalDue < 0.5,

    /** Paid ahead: the pump owes HIM. Rare, and must not print as a demand. */
    inCredit: totalDue <= -0.5,

    lastPayment: last
      ? { date: last.date, amount: last.credit, ageDays: ageInDays(last.date, asAt) }
      : null,

    /** Nothing on the account at all, as against nothing outstanding. */
    empty: rows.length === 0,
  };
}

/** The whole thing in one call, for the download route. */
export function buildAccountStatement(entries, options = {}) {
  return accountFromParts({ rows: prepareAccountRows(entries) }, options);
}

/**
 * Shortcuts that FILL THE TWO DATE BOXES rather than replace them.
 *
 * The dialog used to offer fixed windows only - 7, 15, 30, 90 days back from
 * today - and the owner asked for a date range instead, because the windows
 * cannot say the thing he actually needs to say. A haulier settles for August and
 * wants August: not "the last 45 days", which drags half of July onto the page
 * and stops at today rather than at the 31st. `docs/UI_CONVENTIONS.md` already
 * draws this line for the Daily Register - a fixed window answers "how are we
 * doing lately", a from/to pair answers "these particular days, which I chose".
 * Collecting is the second kind.
 *
 * The chips stay because the common cases are still common, and typing two dates
 * to get last month is four taps too many. They set the boxes, and the boxes
 * remain editable, so a chip is a starting point rather than a mode.
 */
export function statementPresets(today) {
  const [y, m] = String(today).slice(0, 10).split('-').map(Number);
  const firstOfThis = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-01`;
  const prevY = m === 1 ? y - 1 : y;
  const prevM = m === 1 ? 12 : m - 1;
  const firstOfPrev = `${String(prevY).padStart(4, '0')}-${String(prevM).padStart(2, '0')}-01`;

  return [
    { key: 'all', label: 'The whole account', from: '', to: '' },
    { key: 'month', label: 'This month', from: firstOfThis, to: today },
    // Day zero of this month is the last day of the previous one - the same
    // trick monthRange() and RegisterRange use.
    {
      key: 'last-month',
      label: 'Last month',
      from: firstOfPrev,
      to: isoDaysBefore(firstOfThis, 1),
    },
    { key: '30', label: 'Last 30 days', from: isoDaysBefore(today, 29), to: today },
  ];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A date off a query string, or null.
 *
 * The year bound is the one `DateJump` uses, and for the same reason: a native
 * date box reports 0006-08-06 while somebody is still typing 2026, and a URL can
 * be edited by hand into anything at all. A date that fails this is IGNORED
 * rather than refused - the statement is still correct without it, and failing a
 * download over a query string nobody typed would be pedantry.
 */
export function statementDate(value) {
  const text = String(value ?? '').slice(0, 10);
  if (!ISO_DATE.test(text)) return null;
  const year = Number(text.slice(0, 4));
  if (year < 2000 || year > 2100) return null;
  return text;
}

/**
 * The two ends, in the order they were meant.
 *
 * Entered backwards they are swapped rather than rejected. The dialog drags one
 * end with the other so the invalid state is unreachable there, but the route
 * takes a URL, and a URL is not a control.
 */
export function statementRange(fromValue, toValue) {
  const from = statementDate(fromValue);
  const to = statementDate(toValue);
  if (from && to && from > to) return { from: to, to: from };
  return { from, to };
}
