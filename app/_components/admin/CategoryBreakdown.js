import LinearProgress from '@mui/material/LinearProgress';

import Icon from '@/app/_components/ui/Icon';
import { formatPKR } from '@/app/_lib/helpers';

/**
 * Where the month's spending went, biggest first.
 *
 * A LIST OF FIGURES DOES NOT ANSWER THE QUESTION IT IS ASKED. This was
 * "category ......... Rs 7,035" repeated down a card, and the thing anyone
 * actually wants from a breakdown - which costs dominate the month - had to be
 * worked out by comparing numbers of different digit lengths. A bar answers it
 * without arithmetic, and the share in words answers it for anyone who cannot
 * judge a bar length (or is reading this in a dim office at arm's length).
 *
 * WHY MUI'S BAR HERE, when the tank gauges on the Dashboard and the unit
 * progress on Readings are hand-rolled divs. Those two are FILL gauges - how
 * full is this tank, how much of this pump is entered - and they are tuned to
 * sit inside a coloured band, so they carry their own track and fill colours.
 * This is a share-of-total bar in a plain list, which is exactly what
 * `LinearProgress` is, and using it here costs nothing the hand-rolled version
 * was buying. Worth knowing that the app now has both, and which to reach for:
 * a gauge inside a coloured surface is hand-rolled, a share in a list is MUI.
 *
 * The bar is decoration over the figure, never instead of it - the amount and
 * the percentage are both in text beside it, per the rule that colour and
 * shape are second cues rather than the carrier.
 *
 * NO `'use client'`. Nothing here is interactive, and leaving it a server
 * component is what lets it use `formatPKR` from helpers.js - that module
 * reads request cookies for the role checks, so it cannot be pulled into a
 * browser bundle. Importing MUI's own client component from a server one is
 * fine; only the props have to serialise, and these are an array and a number.
 */
/*
 * `title` is optional and defaults to what Expenses has always said, so that
 * page is untouched. Treasury renders two of these side by side - where the
 * cash came from and where it went - and "Where it went" on both would be
 * wrong on one of them.
 */
/*
 * A CATEGORY CAN COME OUT NEGATIVE, and that is not a mistake in the books.
 * Expenses nets a recovery (a negative row, migration 053) into its own
 * category, so a category is negative whenever more came back under it than
 * went out that month. On this pump that is the usual case, not the odd one:
 * the owner types each repayment under a name of its own ("Electricity bill
 * recovery from Tyre shop"), so those categories never hold a payment at all;
 * and a bill paid in one month and paid back in the next leaves the second
 * month's category holding only the repayment. Drawn as a share, it was
 * "Rs -3,500 · -5%" with a bar MUI refused ("value=-1"), and because the
 * shares were taken of the NET month, the categories that did cost money
 * could add up to more than 100%.
 *
 * So a negative category is not a share of where the money went. It is listed
 * apart, under "Recovered this month", biggest first, in green with the arrow
 * in, and no bar. (A category that also had a payment in it shows what is left
 * after the payment; the table lists both rows.) `total` is what the
 * shares are a percentage OF: the caller passes the sum of the categories that
 * cost money (Treasury's rows are never negative, so its totals are
 * unchanged). The bar is clamped to 0-100 all the same, so no figure can ever
 * hand MUI a value it rejects.
 *
 * THE CAPTION NAMES THE LIST; IT DOES NOT COMPARE. It first read "More came
 * back than was spent this month": true of each row under it, and read, as a
 * heading is, as a claim about the whole month. September 2026 had Rs 303,549
 * spent and Rs 29,000 recovered, and the caption said the opposite.
 * "Recovered" is the word on the button, on the card above and on the badge in
 * the table.
 */
export default function CategoryBreakdown({ rows, total, title = 'Where it went' }) {
  const spent = rows.filter(([, amount]) => Number(amount) >= 0);
  // Biggest first, like the list above it: the most negative is the most
  // that came back. `filter` returns a new array, so this sorts no one's rows.
  const back = rows
    .filter(([, amount]) => Number(amount) < 0)
    .sort((a, b) => Number(a[1]) - Number(b[1]));

  return (
    // A `.panel`, and no margin of its own - the page sets the gap. The title
    // at a card title's size, and the rows at the 16px body size (they were
    // 14px, under the floor, with the share in ink-500, under the contrast one).
    <div data-card className="panel p-5">
      <h2 className="mb-4 text-lg font-bold text-ink-900">{title}</h2>

      {spent.length > 0 ? (
        <ul className="space-y-3">
          {spent.map(([category, amount]) => {
            const share = total > 0 ? Math.round((amount / total) * 100) : 0;

            return (
              <li key={category}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  {/* A typed category can be a whole sentence - this pump has
                      one reading "salary of haseeb and pump tea and lunch" - so
                      the name wraps and the figure never does. And when there
                      is not room for even one of the name's words beside the
                      figure (a 320px phone squeezed "Deposited" into 76px), the
                      figure drops to its own line rather than the word being
                      cut. */}
                  <span className="text-base text-ink-800">{category}</span>
                  <span className="tabular ml-auto shrink-0 whitespace-nowrap text-base font-semibold text-ink-900">
                    {formatPKR(amount)}
                    <span className="ml-2 text-sm font-normal text-ink-600">{share}%</span>
                  </span>
                </div>

                <LinearProgress
                  variant="determinate"
                  value={Math.max(0, Math.min(100, share))}
                  aria-hidden="true"
                  sx={{
                    mt: 0.75,
                    height: 6,
                    borderRadius: 999,
                    backgroundColor: 'var(--color-ink-200)',
                    '& .MuiLinearProgress-bar': { borderRadius: 999 },
                  }}
                />
              </li>
            );
          })}
        </ul>
      ) : null}

      {back.length > 0 ? (
        <div className={spent.length > 0 ? 'mt-5 border-t border-ink-200/70 pt-4' : undefined}>
          <p className="caption mb-2">Recovered this month</p>
          <ul className="space-y-2">
            {back.map(([category, amount]) => (
              <li
                key={category}
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5"
              >
                <span className="text-base text-ink-800">{category}</span>
                {/* The arrow in, the word "back" and the green: three cues that
                    this is money returning, never the minus sign alone. */}
                <span className="tabular ml-auto inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-base font-semibold text-brand-700">
                  <Icon name="moneyIn" className="h-4 w-4" />
                  {formatPKR(Math.abs(amount))} back
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
