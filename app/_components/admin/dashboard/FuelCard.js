import PendingLink from '@/app/_components/ui/PendingLink';
import Icon from '@/app/_components/ui/Icon';
import TankGauge from '@/app/_components/admin/dashboard/TankGauge';
import FigureTile, { FigureRow } from '@/app/_components/admin/dashboard/FigureTile';

import { fuelColor } from '@/app/_lib/fuel-colors';
import { formatDate, shiftISODate } from '@/app/_lib/date-helpers';
import { formatLitres, formatPKR } from '@/app/_lib/format-helpers';

/**
 * Everything the dashboard knows about ONE fuel, on one card: what it sold on
 * the day, what is left in its tank at the close of that day, and how much has
 * gone through the pump this month.
 *
 * WHY ONE CARD PER FUEL, not one section per topic. The old dashboard asked the
 * reader to hold diesel in mind across three places - a "By fuel type" card, a
 * month strip, and a "Tank stock" card further down - with petrol interleaved
 * between them each time. Five blocks for two fuels. Here each fuel is one
 * object, the way the tank and its pumps are one thing on the forecourt, and
 * the page reads as two columns: diesel, petrol. The same rule Readings
 * settled on for its units ("The container is the group").
 *
 * EACH PART NAMES ITS OWN MOMENT, because they are three different spans and a
 * page that steps through time must say which it is showing: "Sold on 26 Sep",
 * "at the close of 26 Sep", "01 Sep to 26 Sep". A figure that is a moment in
 * time says which moment (docs/UI_CONVENTIONS.md).
 *
 * QUIET COLOUR, because the fuels are only being READ here. The band across the
 * top is the fuel's `soft` pair - its pale tint behind its own dark relative -
 * which is what fuel-colors.js provides for "a header that should say which
 * fuel without shouting". The loud filled band stays rationed to the Stock
 * page, where typing into the wrong card costs something. The dot beside the
 * name carries the fuel's true hue, since neither the tint nor the dark text
 * is actually the colour the owner chose. Inside, everything decorative is the
 * fuel's colour or neutral; the only other colours are status - the gain or
 * loss at the dip, stock below zero - which outranks identity.
 *
 * A CARD NEVER COLLAPSES. On a day with nothing entered, the sold part says so
 * in words and links to Readings, while the tank and the month - which are
 * still true - stay where they are. The old page left a fuel with no readings
 * out of its row altogether (`by_fuel_type` only holds fuels that sold), so a
 * day with only petrol entered would have shown no diesel at all.
 */
export default function FuelCard({ fuelType, date, sold, tanks, month }) {
  const color = fuelColor(fuelType);
  const name = color.label || fuelType;
  const headingId = `fuel-card-${fuelType}`;

  return (
    <article
      data-card
      aria-labelledby={headingId}
      className="panel @container flex min-w-0 flex-col overflow-hidden"
    >
      <div className={`flex items-center justify-between gap-3 px-5 py-3 ${color.soft}`}>
        <h3 id={headingId} className="flex items-center gap-2.5 text-lg font-bold">
          <span
            className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-inset ring-black/15"
            style={{ backgroundColor: color.raw }}
            aria-hidden="true"
          />
          {name}
        </h3>
      </div>

      {/* ---- the day's sales ----
          `flex-1`: when the row makes this card taller than its content (the
          other fuel has figures and this one has none yet), the spare height
          goes here, under the words that say why, and the tank and the month
          below stay level with the card beside it. */}
      <div className="flex-1 px-5 pb-5 pt-4">
        <p className="caption">Sold on {formatDate(date)}</p>

        {sold ? (
          <>
            <p className="tabular mt-1 whitespace-nowrap text-3xl font-bold tracking-tight text-ink-900">
              {formatLitres(sold.litres_sold)}
            </p>

            <FigureRow>
              <FigureTile label="Sales" value={formatPKR(sold.sale_amount)} />
              <FigureTile label="Cash" value={formatPKR(sold.cash_amount)} />
              <FigureTile label="Credit" value={formatPKR(sold.credit_amount)} />
            </FigureRow>
          </>
        ) : (
          <p className="mt-2 text-base text-ink-700">
            No {name.toLowerCase()} readings entered for this day.{' '}
            <PendingLink
              href={`/admin/readings?date=${date}`}
              className="font-semibold text-brand-700 underline-offset-2 hover:underline"
            >
              Enter readings
            </PendingLink>
          </p>
        )}
      </div>

      {/* ---- the tank ---- */}
      {tanks.map((tank) => (
        <TankBlock key={tank.id} tank={tank} fuelType={fuelType} date={date} />
      ))}

      {/* ---- the month so far ----
          Always rendered, including on a day with nothing entered, which is
          exactly the day a month-to-date figure is still worth having (see
          migration 055 and the changelog). Litres only: the month's rupees are
          the Reports page's job, and repeating them here in a different scope
          would confuse rather than add. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-ink-200/70 bg-ink-50 px-5 py-4">
        <div className="min-w-0">
          <p className="text-base font-semibold text-ink-800">{month.label} so far</p>
          <p className="caption">
            {formatDate(month.from)} to {formatDate(date)}
          </p>
        </div>
        <p className="tabular whitespace-nowrap text-xl font-bold text-ink-900">
          {formatLitres(month.litres)}
        </p>
      </div>
    </article>
  );
}

/**
 * One tank, at the close of the day on screen.
 *
 * `expected_stock` - THE BOOKS AT THE CLOSE OF THE DATE SHOWN - and not the
 * tank's cached `current_stock_litres`, which means "right now". Reading the
 * cached one left every past day showing today's stock, the one block on the
 * page that ignored the date above it (migration 039, and the changelog entry
 * "The dashboard's tank stock ignored the date on screen").
 */
function TankBlock({ tank, fuelType, date }) {
  const stock = Number(tank.expected_stock ?? tank.current_stock_litres ?? 0);
  const capacity = Number(tank.capacity_litres ?? 0);
  const fill = capacity > 0 ? Math.min(100, Math.max(0, (stock / capacity) * 100)) : 0;
  const gainLoss = tank.gain_loss === null || tank.gain_loss === undefined ? null : Number(tank.gain_loss);

  return (
    <div className="border-t border-ink-200/70 px-5 py-5">
      <div className="flex items-center gap-5">
        <TankGauge
          fuelType={fuelType}
          percent={fill}
          label={`${tank.name} is about ${Math.round(fill)} percent full`}
        />

        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-ink-800">{tank.name}</p>
          <p
            className={`tabular mt-0.5 whitespace-nowrap text-2xl font-bold tracking-tight ${
              stock < 0 ? 'text-red-700' : 'text-ink-900'
            }`}
          >
            {formatLitres(stock)}
          </p>
          {/* Which moment this is, in the Stock page's own words - it is an
              end-of-day figure, the day's sales already off and its
              deliveries already on, and the owner once had to ask. */}
          <p className="caption">at the close of {formatDate(date)}</p>
          <p className="tabular mt-2 text-base text-ink-700">
            <span className="font-semibold text-ink-900">{Math.round(fill)}% full</span>
            <span className="mx-1.5 text-ink-400" aria-hidden="true">
              ·
            </span>
            holds <span className="whitespace-nowrap">{formatLitres(capacity)}</span>
          </p>
        </div>
      </div>

      {/* Below zero means more fuel sold than ever went in - a delivery is
          missing, or an opening stock was never set. Said in words, not just
          by the red figure above. */}
      {stock < 0 ? (
        <p className="mt-4 flex items-start gap-2 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-800">
          <Icon name="warning" className="mt-px h-4 w-4" />
          <span>
            Stock has gone below zero. A delivery is probably missing, or this tank’s opening
            stock was never set under Settings.
          </span>
        </p>
      ) : null}

      <DipResult gainLoss={gainLoss} date={date} />
    </div>
  );
}

/**
 * What the dip that CLOSES this day found against the books. The pump dips
 * first thing in the morning, so that dip is taken the NEXT day - which is why
 * "Record one" opens the Stock page on the day after the one on screen.
 */
function DipResult({ gainLoss, date }) {
  if (gainLoss === null) {
    return (
      <p className="mt-4 text-base text-ink-700">
        No dip has closed this day yet.{' '}
        <PendingLink
          href={`/admin/stock-checks?date=${shiftISODate(date, 1)}`}
          className="font-semibold text-brand-700 underline-offset-2 hover:underline"
        >
          Record one
        </PendingLink>
      </p>
    );
  }

  /* The words say gain or loss; the arrow says it again as a shape; the
     colour is the third cue, never the only one. */
  const shape =
    gainLoss === 0
      ? { cls: 'bg-ink-100 text-ink-700', text: 'Dip matches the books exactly', glyph: 'check' }
      : gainLoss > 0
        ? {
            cls: 'bg-brand-50 text-brand-800',
            text: `Gain of ${formatLitres(gainLoss)} against the books`,
            glyph: 'up',
          }
        : {
            cls: 'bg-red-50 text-red-800',
            text: `Loss of ${formatLitres(Math.abs(gainLoss))} against the books`,
            glyph: 'down',
          };

  return (
    <p
      className={`tabular mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold ${shape.cls}`}
    >
      {shape.glyph === 'check' ? (
        <Icon name="check" className="h-4 w-4" />
      ) : (
        <svg viewBox="0 0 12 12" className="h-3 w-3 shrink-0" aria-hidden="true">
          <path d={shape.glyph === 'up' ? 'M6 2 10.5 9h-9Z' : 'M6 10 1.5 3h9Z'} fill="currentColor" />
        </svg>
      )}
      {shape.text}
    </p>
  );
}
