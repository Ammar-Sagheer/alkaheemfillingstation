import { formatDate } from '@/app/_lib/date-helpers';

/**
 * One fuel's Daily Sale & Stock Register - the table this page exists for.
 *
 * A plain `<table>` in the app's own cell classes since the page moved to the
 * new look (docs/UI_CONVENTIONS.md -> "The new look"). It was a Material UI
 * `Table` styled through `sx`, at the owner's request when the page was a
 * preview; the look it had to match is now the Dashboard's, and every other
 * table on the site is drawn this way. Nothing in it has state, so it stays a
 * Server Component.
 *
 * ---------------------------------------------------------------------------
 * THE TABLE IS WIDER THAN THE PAGE, AND THAT IS THE DESIGN PROBLEM
 * ---------------------------------------------------------------------------
 * With the 240px sidebar, a 1152px window leaves this about 880px and a 1024px
 * one about 750px. Ten numeric columns do not fit in either, so the table
 * scrolls inside its own panel - which is this app's normal answer for a wide
 * table and is fine for Purchases or the ledger.
 *
 * It was NOT fine here, and the first screenshot showed why: scrolled to its
 * natural start, the columns on screen were opening stock and receipts, and
 * the cumulative block - the reason anybody opens this page, the block the
 * owner circled on his own spreadsheet - was off the right-hand edge at every
 * width including a phone. A table whose point is invisible until you scroll
 * is a table that will be read wrong.
 *
 * Two things fix it, and both are worth copying to the next wide table:
 *
 *   - THE DATE COLUMN IS PINNED LEFT and THE CUMULATIVE BLOCK IS PINNED
 *     RIGHT. Whatever the scroll position, the reader can always see which day
 *     a row is and where the running totals stand; the middle - the working
 *     that gets from one to the other - is what slides. Sticky headers already
 *     do the same job vertically, and `.table-scroll` is what both rely on:
 *     the wrapper has to be the scrolling element.
 *   - TWO COLUMNS THAT WERE ONLY EVER DERIVED CAME OUT, because a scrollable
 *     region clips at its edge and the first screenshot clipped it straight
 *     through a dip reading - "5,219.(" - which reads as a broken number
 *     rather than as more table. The two cheapest columns were:
 *       · THE DAY'S SALE IN RUPEES. Not part of the stock reconciliation at
 *         all; the fuel cards above carry each fuel's takings for exactly
 *         these days and the profit cards carry the money.
 *       · TOTAL STOCK. The owner's spreadsheet has it, and it is opening plus
 *         received - the two columns immediately to its left. Deliveries are a
 *         handful a week, so on most rows it was a verbatim copy of Opening.
 *
 * ON A PHONE ONLY THE DATE IS PINNED. Four pinned columns need about 28rem
 * between them, and a phone's panel is 20 to 23rem: pinned regardless, the
 * running block slid over the date and printed "01 Sep 20" - a truncated
 * year, which reads as corrupt data rather than as a layout problem. That was
 * already true of the old table below 400px, and the new look's page margin
 * took the last of the room at 400. So the right-hand block pins only once
 * the panel is 40rem wide (`.pinned-right-roomy` in globals.css); narrower,
 * it scrolls with the rest, the date stays put, and the bottom line of the
 * running block is already on the fuel card at the top of the page.
 *
 * The pinned columns need FIXED WIDTHS - a sticky offset has to be a number,
 * so `right` on the middle of three pinned columns is the sum of the widths to
 * its right. They are the constants below; change one and change the offsets
 * with it. Sized against the widest real values in the widest font the app
 * falls back to ("01 Sep 2026", "48,123.45", "−1,234.56", "−10.25%"), with
 * the cells' 10px of padding each side.
 *
 * ---------------------------------------------------------------------------
 * WHY A TWO-ROW HEADER, AND WHERE THE UNITS ARE
 * ---------------------------------------------------------------------------
 * Ten numeric columns is more than anyone holds in their head, and the
 * spreadsheet this replaces does not ask them to: its columns come in groups -
 * what was in the tank, what went out, what the books say against what the rod
 * says, and the running totals. The grouping row is the one piece of the Excel
 * layout worth copying exactly. It is a fixed 36px tall, because the column
 * row under it sticks at exactly that far down (`top-9`): both rows used to
 * stick at the top, and the second slid over the first as the table scrolled.
 *
 * UNITS LIVE IN THE HEADER, NOT IN THE CELLS. Every column here is litres, and
 * "4,720.00 L" ten times across is a third more width for a fact the heading
 * states once. The conventions' rule that a figure and its unit must not break
 * apart still holds - it is satisfied by there being no unit in the cell to
 * break away from.
 *
 * EVERY LITRE FIGURE CARRIES TWO DECIMALS, including whole ones. Meter sales
 * genuinely run to the centilitre and dips are usually whole, so left to
 * themselves the column read "5,556", "332.46", "1,033.8" - three different
 * shapes in one column of tabular numerals, which stops the decimal points
 * lining up and is exactly what tabular numerals are for.
 *
 * ---------------------------------------------------------------------------
 * COLOUR, AND WHAT CARRIES THE MEANING
 * ---------------------------------------------------------------------------
 * The cumulative block gets a NEUTRAL grey tint, not a colour. It has to be
 * findable at a glance - but a tint that meant something (green for good,
 * amber for owed) would be claiming a verdict about figures that are as often
 * negative as positive. The tint says "these belong together"; the numbers say
 * how it went.
 *
 * Gain and loss are the app's existing chrome pair, brand-700 and red-700, and
 * COLOUR IS NEVER THE ONLY CUE: every variance carries an explicit + or − in
 * front of it, so the column reads the same in a photocopy, in poor light, or
 * to someone who cannot tell the two hues apart.
 *
 * A DAY WITH NO DIP SAYS "No dip" in the dip column and leaves its gain / loss
 * blank - never a zero. Nobody measured the tank, so the variance is unknown,
 * and a zero would say the opposite: that it was measured and came out exact,
 * which is the one thing a rod reading almost never does. A day with nothing
 * delivered leaves Received blank for the same eye-saving reason as before -
 * deliveries are the exception in that column, and the eye should find them.
 */

// The date column: narrow on a phone, where it prints "01 Sep", and wide
// enough for "01 Sep 2026" once the panel is 40rem.
const DATE_W = 'w-[6.5rem] min-w-[6.5rem] @[40rem]:w-32 @[40rem]:min-w-32';

// The running block, right to left: % is 6rem at right 0, gain / loss is
// 6.75rem at right 6rem, sold is 7rem at right 6 + 6.75 = 12.75rem.
//
// The offset goes in as `--pin-right`, NOT as `right`. The class applies it
// only on a panel with room to pin; an inline `right` would apply everywhere,
// and a header cell is already sticky (for the vertical pin), so on a phone
// the three headings would have stuck to the right while their columns
// scrolled away beneath them.
const SOLD_W = { width: '7rem', minWidth: '7rem', '--pin-right': '12.75rem' };
const GAIN_W = { width: '6.75rem', minWidth: '6.75rem', '--pin-right': '6rem' };
const PCT_W = { width: '6rem', minWidth: '6rem', '--pin-right': '0px' };
const BLOCK_W = { width: '19.75rem', minWidth: '19.75rem', '--pin-right': '0px' };

const PIN_LEFT = 'pinned pinned-left left-0';
const PIN_RIGHT = 'pinned-right-roomy';

// Every cell is 15px with 10px either side: a touch under the body size, the
// one table on the site allowed it, because ten columns of litres is what the
// page is.
const NUM = 'td-num px-2.5 text-[0.9375rem]';
const HEAD = 'th px-2.5 text-right';
const GROUP = 'th h-9 px-2.5 py-0 text-center';

/** brand-700 for a gain, red-700 for a loss, ink-600 for exactly nothing. */
function toneOf(value) {
  if (value === null || value === undefined) return 'text-ink-600';
  const n = Number(value);
  if (n > 0) return 'text-brand-700';
  if (n < 0) return 'text-red-700';
  return 'text-ink-600';
}

/** Litres, always to two decimals so the column's decimal points line up. */
function litres(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** "+55.20" / "−1.43", or nothing. The sign is the cue that survives without colour. */
function signed(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  // U+2212 MINUS SIGN, not a hyphen: it is the same width as the plus above it
  // in a tabular-numerals column, so the signs line up down the column.
  const sign = n > 0 ? '+' : n < 0 ? '−' : '';
  return `${sign}${litres(Math.abs(n))}`;
}

function pct(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const sign = n > 0 ? '+' : n < 0 ? '−' : '';
  return `${sign}${Math.abs(n).toFixed(2)}%`;
}

/**
 * The summary row's dates: "01 to 07 Sep" for a range, "01 Sep" for one day,
 * and the month left off on a phone ("01 to 07"), where the column is 6.5rem.
 *
 * Built by hand rather than from `formatDate` twice, because "01 Sep 2026 to
 * 07 Sep 2026" is three times the width of the column it has to sit in and
 * repeats the month and the year for nothing. Both ends always fall in one
 * month, because the range picker cannot span two, and the page's own heading
 * carries the year. "to" rather than a dash, as everywhere else on the site.
 */
function RangeLabel({ fromDay, toDay }) {
  const [, month, day] = String(fromDay).slice(0, 10).split('-');
  const lastDay = String(toDay).slice(0, 10).split('-')[2];
  const monthName = MONTHS[Number(month) - 1] ?? '';

  if (day === lastDay) return `${day} ${monthName}`;

  return (
    <>
      {day} to {lastDay}
      <span className="hidden @[40rem]:inline"> {monthName}</span>
    </>
  );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "01 Sep 2026" on a panel with room for it, "01 Sep" on a phone. */
function RowDate({ day }) {
  const full = formatDate(day);
  return (
    <>
      {full.slice(0, 6)}
      <span className="hidden @[40rem]:inline">{full.slice(6)}</span>
    </>
  );
}

export default function RegisterTable({ rows = [] }) {
  if (rows.length === 0) return null;

  const first = rows[0];
  const last = rows[rows.length - 1];

  // The footer is the range as one line: the stock it opened with, everything
  // that moved through it, and the stock it closed on. Receipts are summed;
  // opening and closing are the two ENDS of the range, not sums - a total of
  // every day's opening stock would be a number with no meaning.
  const totals = {
    opening: Number(first.opening_stock ?? 0),
    receipts: rows.reduce((sum, row) => sum + Number(row.receipts ?? 0), 0),
    sales: Number(last.cumulative_sales ?? 0),
    closing: last.closing_dip === null ? null : Number(last.closing_dip),
    variance: Number(last.cumulative_variance ?? 0),
    variancePct:
      last.cumulative_variance_pct === null ? null : Number(last.cumulative_variance_pct),
  };

  const topRule = 'border-t-2 border-ink-300';
  const block = 'bg-ink-100';

  return (
    <div className="table-scroll has-pinned-columns mx-0">
      <table className="w-full min-w-max">
        <thead>
          <tr>
            {/* Empty: the date's heading is the row under this one. */}
            <th className={`${GROUP} ${PIN_LEFT} ${DATE_W}`} />
            <th className={GROUP} colSpan={2}>
              In the tank
            </th>
            <th className={GROUP}>Sold</th>
            <th className={GROUP} colSpan={2}>
              At the close
            </th>
            {/* "Gain / loss", not "Gain / loss that day". The longer version
                wrapped to two lines and then clipped at the pinned block's
                edge, rendering as "GAIN / LOSS T" over "DAY". The pairing with
                "Running total" beside it already says which is which, and the
                running-total group names its own gain / loss column again. */}
            <th className={GROUP} colSpan={2}>
              Gain / loss
            </th>
            <th className={`${GROUP} ${PIN_RIGHT} ${block}`} style={BLOCK_W} colSpan={3}>
              Running total
            </th>
          </tr>
          <tr>
            <th className={`th top-9 px-2.5 ${PIN_LEFT} ${DATE_W}`}>Date</th>
            <th className={`${HEAD} top-9`}>Opening</th>
            <th className={`${HEAD} top-9`}>Received</th>
            <th className={`${HEAD} top-9`}>Litres</th>
            <th className={`${HEAD} top-9`}>Should be</th>
            <th className={`${HEAD} top-9`}>Dip</th>
            <th className={`${HEAD} top-9`}>Litres</th>
            <th className={`${HEAD} top-9`}>%</th>
            <th className={`${HEAD} top-9 ${PIN_RIGHT} ${block}`} style={SOLD_W}>
              Sold
            </th>
            <th className={`${HEAD} top-9 ${PIN_RIGHT} ${block}`} style={GAIN_W}>
              Gain / loss
            </th>
            <th className={`${HEAD} top-9 ${PIN_RIGHT} ${block}`} style={PCT_W}>
              %
            </th>
          </tr>
        </thead>

        <tbody className="divide-y divide-ink-100">
          {rows.map((row) => (
            <tr key={row.day}>
              {/* Opaque white: a pinned cell the row can show through is not
                  pinned, it is smeared. */}
              <td
                className={`td whitespace-nowrap bg-white px-2.5 text-[0.9375rem] font-semibold text-ink-900 ${PIN_LEFT} ${DATE_W}`}
              >
                <RowDate day={row.day} />
              </td>
              <td className={NUM}>{litres(row.opening_stock)}</td>
              <td className={`${NUM} text-ink-700`}>
                {Number(row.receipts) > 0 ? litres(row.receipts) : null}
              </td>
              <td className={`${NUM} font-semibold text-ink-900`}>{litres(row.meter_sales)}</td>
              <td className={NUM}>{litres(row.book_stock)}</td>
              <td className={NUM}>
                {row.closing_dip === null || row.closing_dip === undefined ? (
                  <span className="font-normal text-ink-600">No dip</span>
                ) : (
                  litres(row.closing_dip)
                )}
              </td>
              <td className={`${NUM} font-bold ${toneOf(row.daily_variance)}`}>
                {signed(row.daily_variance)}
              </td>
              <td className={`${NUM} ${toneOf(row.daily_variance_pct)}`}>
                {pct(row.daily_variance_pct)}
              </td>
              <td className={`${NUM} ${PIN_RIGHT} ${block} font-semibold text-ink-900`} style={SOLD_W}>
                {litres(row.cumulative_sales)}
              </td>
              <td
                className={`${NUM} ${PIN_RIGHT} ${block} font-bold ${toneOf(row.cumulative_variance)}`}
                style={GAIN_W}
              >
                {signed(row.cumulative_variance)}
              </td>
              <td
                className={`${NUM} ${PIN_RIGHT} ${block} ${toneOf(row.cumulative_variance_pct)}`}
                style={PCT_W}
              >
                {pct(row.cumulative_variance_pct)}
              </td>
            </tr>
          ))}

          {/* The footer repeats the last row's cumulative figures on purpose.
              Over a long range the reader is at the bottom of a scrolled table
              and the answer IS the last row - but only if they know that. A
              labelled summary row says it outright.

              IT SAYS WHAT THE ROW IS, AND THEN WHICH DAYS. It said "These
              days" first, and the owner's response to that was "what is these
              days" - the whole verdict on it in four words. One line cannot
              do this job: the reader needs to know both that this is not
              another day, and which days it covers.

              "Summary" rather than "Total", because two of its own cells are
              not totals - opening stock and the dip are the two ENDS of the
              range, and a sum of every day's opening stock would be a figure
              with no meaning. Calling the row a total would promise arithmetic
              it deliberately does not do. */}
          <tr>
            <td
              className={`td whitespace-nowrap bg-ink-50 px-2.5 ${topRule} ${PIN_LEFT} ${DATE_W}`}
            >
              <span className="block text-[0.9375rem] font-bold text-ink-900">Summary</span>
              <span className="block text-sm font-semibold text-ink-600">
                <RangeLabel fromDay={first.day} toDay={last.day} />
              </span>
            </td>
            <td className={`${NUM} ${topRule}`}>{litres(totals.opening)}</td>
            <td className={`${NUM} ${topRule} font-bold text-ink-900`}>
              {totals.receipts > 0 ? (
                litres(totals.receipts)
              ) : (
                <span className="font-normal text-ink-600">None</span>
              )}
            </td>
            <td className={`${NUM} ${topRule} font-bold text-ink-900`}>{litres(totals.sales)}</td>
            <td className={`${NUM} ${topRule}`} />
            <td className={`${NUM} ${topRule} font-bold text-ink-900`}>
              {totals.closing === null ? (
                <span className="font-normal text-ink-600">No dip</span>
              ) : (
                litres(totals.closing)
              )}
            </td>
            <td className={`${NUM} ${topRule}`} />
            <td className={`${NUM} ${topRule}`} />
            <td
              className={`${NUM} ${topRule} ${PIN_RIGHT} ${block} font-bold text-ink-900`}
              style={SOLD_W}
            >
              {litres(totals.sales)}
            </td>
            <td
              className={`${NUM} ${topRule} ${PIN_RIGHT} ${block} font-bold ${toneOf(totals.variance)}`}
              style={GAIN_W}
            >
              {signed(totals.variance)}
            </td>
            <td
              className={`${NUM} ${topRule} ${PIN_RIGHT} ${block} font-bold ${toneOf(totals.variancePct)}`}
              style={PCT_W}
            >
              {pct(totals.variancePct)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
