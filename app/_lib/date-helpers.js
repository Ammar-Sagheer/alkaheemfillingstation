/**
 * Date helpers that are safe on BOTH the server and in the browser.
 *
 * These live apart from helpers.js on purpose. helpers.js reads request cookies
 * for the role checks, so it can never be pulled into a browser bundle - which
 * left the client forms inlining their own date logic, and getting it wrong.
 * One implementation, imported from both sides, cannot drift.
 *
 * helpers.js re-exports everything here, so server code can keep importing from
 * there as before.
 */

/**
 * Where the pump is. The business day is decided by this, not by the clock on
 * whatever machine happens to be asking.
 *
 * Change this one line if the pump ever moves to another timezone.
 */
export const PUMP_TIMEZONE = 'Asia/Karachi';

/**
 * Today at the pump, as 'YYYY-MM-DD' - what <input type="date"> and Postgres
 * `date` columns both expect.
 *
 * Two traps this avoids, both of which file entries against the wrong day:
 *
 *   1. `toISOString().slice(0, 10)` converts to UTC first. In Pakistan (UTC+5)
 *      every date field would default to YESTERDAY between midnight and 5am, so
 *      a payment taken at 1am lands on the previous day.
 *   2. Relying on the machine's own clock. The browser sits in Pakistan, but a
 *      Vercel server runs in UTC - so the two would disagree for those same
 *      five hours, and the date shown would not match the date saved.
 *
 * Pinning to the pump's timezone makes server and browser always agree, and
 * means checking the books from another country still shows the pump's day.
 * 'en-CA' is used because it formats as YYYY-MM-DD.
 */
const isoDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: PUMP_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function todayISO() {
  return isoDateAtPump(new Date());
}

/**
 * Which calendar day, at the pump, a given instant fell on.
 *
 * todayISO() is this with `now` passed in, and it is split out because the
 * activity log needs the same question asked of a stored timestamp: was this
 * entry filed against the day it was typed on, or an earlier one? Re-deriving
 * the formatter at the call site is how the two would drift, which is the
 * mistake this whole file exists to prevent.
 */
export function isoDateAtPump(instant) {
  const at = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(at.getTime())) return null;
  return isoDateFormatter.format(at);
}

/**
 * Shift an ISO date string by whole days.
 *
 * Built in UTC on purpose: the string is a plain calendar date with no time in
 * it, so doing the arithmetic in UTC keeps a daylight-saving change or a
 * timezone offset from nudging it onto the wrong day.
 */
export function shiftISODate(iso, days) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/**
 * How many days from `from` to `to` inclusive, so a single day counts as 1.
 *
 * Both are treated as plain calendar dates at UTC midnight, the same as
 * shiftISODate, which keeps this free of daylight-saving arithmetic - the
 * business day is pinned to Asia/Karachi and never shifts, but the host's
 * clock might.
 */
export function daysBetween(from, to) {
  const parse = (iso) => {
    const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((parse(to) - parse(from)) / 86400000) + 1;
}

/**
 * The first and last calendar day of a month, as ISO strings.
 *
 * `Date.UTC(year, month, 0)` is day zero of the FOLLOWING month, which is the
 * last day of this one - so February and leap years come out right without a
 * table of month lengths.
 */
export function monthRange(year, month) {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, '0');
  return {
    from: `${year}-${mm}-01`,
    to: `${year}-${mm}-${String(lastDay).padStart(2, '0')}`,
  };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * '2026-08-03' -> "Monday, 03 Aug 2026".
 *
 * The weekday is the point. A row of digits is easy to skim past and a date
 * box drawn by the browser may not even be in the order the reader expects,
 * but "Monday" is checkable against the day someone has actually lived - which
 * is the whole job of the banner this feeds.
 *
 * Same string-splitting as formatDate, and for the same reason: `new Date()`
 * on a bare date reads it as UTC midnight and names the wrong weekday for
 * anyone west of Greenwich.
 */
export function formatDateLong(value) {
  if (!value) return '';
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return String(value);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${weekday}, ${String(d).padStart(2, '0')} ${MONTHS[m - 1]} ${y}`;
}

/**
 * A timestamp -> "07 Aug 2026, 7:42 pm", at the pump.
 *
 * The only place in this app that shows a time of day rather than a date, and
 * the timezone matters more here than anywhere else: the activity log's whole
 * job is saying when something happened, and the row is written by Postgres in
 * UTC while the person reading it is standing in Pakistan. Rendered on the
 * server without pinning, "7:42 pm" would be printed as "2:42 pm" and quietly
 * exonerate whoever was on the evening shift.
 *
 * Note this is a real instant, so `new Date()` is correct here - unlike the
 * plain calendar dates above, which are split as strings for the reason
 * formatDate gives.
 */
/*
 * THE DATE HALF IS `formatDate`, NOT Intl's. en-GB's short month is "Sept" in
 * current ICU (Node 22, recent Chromium), so a timestamp read "25 Sept 2026"
 * beside every other date in the app saying "25 Sep 2026" - and at 16px the
 * longer form ran out of the activity table's 12rem When column. Only the
 * time of day comes from Intl, pinned to the pump like everything else.
 */
const timeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: PUMP_TIMEZONE,
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

export function formatDateTime(value) {
  if (!value) return '';
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return String(value);
  // en-GB gives "7:42 pm"; the space before the meridiem is a narrow no-break
  // space, which is fine on screen but awkward to search for.
  const time = timeFormatter.format(at).replace(/\u202f/g, ' ');
  return `${formatDate(isoDateAtPump(at))}, ${time}`;
}

const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                     'August', 'September', 'October', 'November', 'December'];

/** '2026-08' or (2026, 8) -> "August 2026". */
export function formatMonth(year, month) {
  return `${MONTHS_LONG[month - 1]} ${year}`;
}

/**
 * '2026-08-03' -> "03 Aug 2026".
 *
 * Parsed by splitting the string rather than with `new Date(value)`, which would
 * read it as UTC midnight and then print the previous day for anyone west of
 * Greenwich.
 */
export function formatDate(value) {
  if (!value) return '';
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return String(value);
  return `${String(d).padStart(2, '0')} ${MONTHS[m - 1]} ${y}`;
}
