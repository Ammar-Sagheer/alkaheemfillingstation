import PendingLink from '@/app/_components/ui/PendingLink';
import FigureTile, { FigureRow } from '@/app/_components/admin/dashboard/FigureTile';

import { fuelColor } from '@/app/_lib/fuel-colors';
import { formatDate } from '@/app/_lib/date-helpers';
import { formatLitres, formatPKR } from '@/app/_lib/format-helpers';

const LUBRICANT = fuelColor('lubricant');

/**
 * The oil side of the day: what went over the counter, and what is left on the
 * shelf. Two panels, each banded in lubricant's gold the way the fuel cards are
 * banded in theirs - the colour this product already wears on its badge and its
 * chart, so the same quiet `soft` treatment says "this is oil" without a new
 * colour decision.
 *
 * A product name WRAPS; a figure never does. "Caltex Havoline Formula 20W-50
 * (4 L carton)" is a real shelf name, and cutting it to "Caltex Havoline F..."
 * hides the part that tells two products apart. The litres and rupees beside it
 * are nowrap.
 */
export default function LubricantPanels({ date, lubricants, sold, stock }) {
  if (stock.length === 0) {
    return (
      <div data-card className="panel px-5 py-6 text-center text-base text-ink-700">
        No lubricants set up yet.{' '}
        <PendingLink
          href="/admin/lubricants"
          className="font-semibold text-brand-700 underline-offset-2 hover:underline"
        >
          Add the ones the pump stocks
        </PendingLink>
      </div>
    );
  }

  const nothingSold = Number(lubricants.sales_count ?? 0) === 0;

  return (
    // One height for the pair (the grid's own stretch): on a day with nothing
    // sold, the counter panel stopped a hand's width short of the shelf beside
    // it, which read as broken rather than as quiet.
    <div className="grid gap-4 @[50rem]:grid-cols-2">
      {/* ---- the counter ---- */}
      <article data-card className="panel @container min-w-0 overflow-hidden">
        <Band title="Sold over the counter" />
        <div className="px-5 pb-5 pt-4">
          <p className="caption">Sold on {formatDate(date)}</p>
          <p className="tabular mt-1 whitespace-nowrap text-3xl font-bold tracking-tight text-ink-900">
            {formatPKR(lubricants.amount)}
          </p>

          {nothingSold ? (
            <p className="mt-3 text-base text-ink-700">
              Nothing sold over the counter on this date.{' '}
              <PendingLink
                href={`/admin/lubricants?date=${date}`}
                className="font-semibold text-brand-700 underline-offset-2 hover:underline"
              >
                Record a sale
              </PendingLink>
            </p>
          ) : (
            <>
              <FigureRow>
                <FigureTile label="Litres" value={formatLitres(lubricants.litres)} />
                <FigureTile label="Cash" value={formatPKR(lubricants.cash_amount)} />
                <FigureTile label="Credit" value={formatPKR(lubricants.credit_amount)} />
              </FigureRow>

              <ul className="mt-4 divide-y divide-ink-200/70 border-t border-ink-200/70">
                {sold.map((product) => (
                  <li
                    key={product.name}
                    className="flex items-baseline justify-between gap-4 py-2.5 text-base"
                  >
                    <span className="min-w-0 text-ink-800">{product.name}</span>
                    <span className="tabular shrink-0 whitespace-nowrap font-semibold text-ink-900">
                      {formatLitres(product.litres)}
                      <span className="mx-1.5 font-normal text-ink-400" aria-hidden="true">
                        ·
                      </span>
                      {formatPKR(product.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </article>

      {/* ---- the shelf ----
          So a product about to run out is noticed from here rather than when a
          customer asks for it. As at the date on screen, so an older day's shelf
          agrees with the Stock page's shelf for that day. */}
      <article data-card className="panel @container min-w-0 overflow-hidden">
        <Band title="On the shelf" />
        <div className="px-5 pb-3 pt-4">
          <p className="caption">In stock at the close of {formatDate(date)}</p>
          <ul className="mt-2 divide-y divide-ink-200/70">
            {stock.map((product) => {
              const left = Number(product.stock_litres ?? 0);
              const out = left <= 0;
              return (
                <li key={product.id} className="flex items-center justify-between gap-4 py-2.5 text-base">
                  <span className="min-w-0 text-ink-800">{product.name}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    {/* THE WORD, NOT JUST THE COLOUR. The old card said "run
                        out" by printing 0 L in red and nothing else - the same
                        shape as 16 L in black to a red-green colourblind reader
                        in a dim office. The Lubricants page already carries the
                        word; now this does too. */}
                    {out ? (
                      <span className="badge bg-red-100 text-xs text-red-800">Out of stock</span>
                    ) : null}
                    <span
                      className={`tabular whitespace-nowrap font-semibold ${
                        out ? 'text-red-700' : 'text-ink-900'
                      }`}
                    >
                      {formatLitres(left)}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </article>
    </div>
  );
}

function Band({ title }) {
  return (
    <div className={`flex items-center gap-2.5 px-5 py-3 ${LUBRICANT.soft}`}>
      <span
        className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-inset ring-black/15"
        style={{ backgroundColor: LUBRICANT.raw }}
        aria-hidden="true"
      />
      <h3 className="text-lg font-bold">{title}</h3>
    </div>
  );
}
