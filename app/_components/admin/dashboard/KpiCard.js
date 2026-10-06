import Icon from '@/app/_components/ui/Icon';
import Sparkline from '@/app/_components/ui/Sparkline';
import DeltaBadge from '@/app/_components/ui/DeltaBadge';

import { TILE, LINE } from '@/app/_components/admin/dashboard/tones';

/**
 * One headline figure, in the new look: what `StatTile` was to the old one
 * (deleted once every page had moved to this).
 *
 * Top to bottom, in the order it is read - which is the order of importance:
 *
 *   1. what it is - an icon tile in the figure's meaning colour, and the label
 *      in words at 16px, in sentence case. The old tile's label was a 12px
 *      uppercase caption, the smallest text on the card sitting over the
 *      biggest; here the label is body-sized and still clearly the lesser of
 *      the two.
 *   2. the figure, 30px once the card has the room (24px below that).
 *   3. a description of it - "Rs 750,819 fuel · Rs 1,375 lubricants".
 *   4. the trend, as a band along the bottom edge of the card.
 *
 * The change against yesterday sits at the top right, as the pill alone. The
 * sentence that used to follow it was removed at the owner's request and stays
 * removed; the arrow carries the direction, so colour is never the only cue.
 *
 * THE SPARKLINE GETS ITS OWN BAND, WHICH ENDS AN OLD ARGUMENT. On `StatTile`
 * the line shared a row with the figure and had to yield - first by vanishing,
 * which the owner reported ("the graphs disappear when screen size reduced"),
 * then by wrapping underneath. Here it never shares: it runs the full width of
 * the card at every size, and the figure owns its line at every size. Nothing
 * has to give way, so nothing moves as the window changes. Still decoration
 * with a shape - no axis, no scale, aria-hidden - and the hover readout shows
 * the same figure the card does, for each day.
 *
 * `sub` may be a node rather than a string, and must be one whenever it holds
 * a money figure: the caller wraps each figure in its own nowrap span, or a
 * narrow card breaks "Rs 1,375" after the "Rs" - which it did, at 1024px, in
 * the first build of this card (docs/UI_CONVENTIONS.md -> "Money inside a
 * sentence").
 *
 * `alert` is for a figure that needs looking at (more than half the day on
 * credit). It turns the figure red AND replaces the description with a red
 * pill carrying a warning glyph and the reason in words - never red alone.
 *
 * `tone` is a key into ./tones.js: which KIND of figure this is. It colours the
 * tile and the line, never the figure; the figure stays near-black unless
 * `alert` says otherwise, because "this is credit" and "this is bad news" are
 * different statements and the old tiles learned not to make one colour say
 * both.
 */
/**
 * The row the cards sit in, measured against its own width rather than the
 * window's. One column on a phone, two from 34rem, then as many as asked for:
 * four waits for 72rem (a label beside its pill needs about 17rem of card, and
 * four of those do not fit beside a pinned sidebar at 1152px), three for 56rem.
 */
const GRID_COLUMNS = {
  2: '@[34rem]:grid-cols-2',
  3: '@[34rem]:grid-cols-2 @[56rem]:grid-cols-3',
  4: '@[34rem]:grid-cols-2 @[72rem]:grid-cols-4',
};

export function KpiGrid({ columns = 4, children }) {
  return (
    <div className="@container">
      <div className={`grid grid-cols-1 gap-4 ${GRID_COLUMNS[columns] ?? GRID_COLUMNS[4]}`}>
        {children}
      </div>
    </div>
  );
}

export default function KpiCard({
  label,
  value,
  icon,
  tone = 'neutral',
  tileClass,
  sub,
  alert,
  delta,
  spark,
  sparkTips,
}) {
  return (
    <article data-card className="panel @container flex min-w-0 flex-col overflow-hidden">
      <div className="flex flex-1 flex-col gap-3 px-5 pb-4 pt-5">
        {/* The label never wraps and the pill gives way instead: on a narrow
            card the pill drops to its own line under the label, because
            "Total / sales" split over two lines beside it made the four cards
            four different heights - found at 1024px. */}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          {/* `tileClass` overrides the tone's tile for the one card whose
              colour is a category's rather than a kind of figure's: Assets'
              "Biggest holding" wears its category's hue, so the card and the
              asset cards below it agree about what Electronics looks like. */}
          <h3 className="flex min-w-0 items-center gap-3 whitespace-nowrap text-base font-semibold text-ink-700">
            <span className={`icon-tile h-10 w-10 ${tileClass ?? TILE[tone] ?? TILE.neutral}`}>
              <Icon name={icon} className="h-[22px] w-[22px]" />
            </span>
            {label}
          </h3>
          {delta ? <DeltaBadge {...delta} /> : null}
        </div>

        {/* nowrap, always. "Rs 1,204,950" breaking after the "Rs" reads for a
            moment as two figures, which a money card must never do - the card
            gets its size from this line, not the other way round. */}
        <p
          className={`tabular whitespace-nowrap text-2xl font-bold tracking-tight @[16rem]:text-3xl ${
            alert ? 'text-red-700' : 'text-ink-900'
          }`}
        >
          {value}
        </p>

        {alert ? (
          <p className="tabular inline-flex w-fit items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-sm font-semibold text-red-800">
            <Icon name="warning" className="h-4 w-4" />
            {alert}
          </p>
        ) : sub ? (
          <p className="tabular text-sm leading-snug text-ink-600">{sub}</p>
        ) : null}
      </div>

      {spark ? (
        <div className={`h-14 ${LINE[tone] ?? LINE.neutral}`}>
          <Sparkline data={spark} tips={sparkTips} className="h-full w-full" />
        </div>
      ) : null}
    </article>
  );
}
