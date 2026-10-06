/**
 * "↗ 37.3%" - a figure's change against the span before it, on the cards that
 * have one.
 *
 * THE PILL AND NOTHING ELSE. It shipped with the comparison spelled out beside
 * it ("up from Rs 1,204,950 yesterday") and the owner had it removed. He is
 * right: on a tile that already carries a label, a figure and a sparkline, a
 * fourth line of prose is the one thing on the card nobody is reading, and it
 * pushed the tiles taller for it. The arrow says which way, the percentage
 * says how far, and the number it came from is on yesterday's screen - which
 * is one date-step away and not worth a permanent line on every card.
 *
 * `previous` is still REQUIRED, because the badge cannot be computed without
 * it. It is simply no longer printed.
 *
 * NO MARGIN OF ITS OWN. The tile owns the spacing between its parts; a
 * component that also adds `mt-1` gives you two spacings added together and a
 * badge that sits at a different distance depending on what is above it.
 *
 * THE ARROW IS DIRECTION; THE COLOUR IS WHETHER IT IS GOOD NEWS. They are not
 * the same axis and this app has to keep them apart: expenses up is an up
 * arrow and a RED pill, sales up is an up arrow and a green one. Colouring by
 * direction alone would paint "expenses rose 40%" in the same green as "sales
 * rose 40%", which is the one mistake a money app cannot make. Callers say
 * which way is good with `higherIsBetter`.
 *
 * NEVER THE ONLY STATEMENT OF THE CHANGE, and this matters more now that the
 * words are gone. The pill summarises two figures the page shows in full
 * elsewhere, and the ARROW carries the direction independently of the colour -
 * so a reader who cannot tell the red pill from the green one still sees which
 * way the figure moved. Colour is the second cue here, never the only one.
 */
export default function DeltaBadge({ current, previous, higherIsBetter = true }) {
  const now = Number(current);
  const before = Number(previous);

  if (!Number.isFinite(now) || !Number.isFinite(before)) return null;

  /*
   * NO BASELINE MEANS NO BADGE. This first rendered the word "New" when there
   * was nothing to divide by, and on the live register that put "New" on all
   * four money tiles at once: the pump's records begin on 01 Aug 2026, so the
   * equal-length span before any August range lands in July, which is empty.
   * The owner's question was "why new?", and the honest answer is that the
   * badge had nothing to say - so it should not have been saying anything.
   *
   * A zero baseline cannot be told apart from an absent one here. Both arrive
   * as 0 from the summary RPC, and "sales rose from nothing" and "we have no
   * July to compare against" are different sentences that deserve different
   * words. Given the choice between a label that is sometimes wrong and no
   * label, a card with no comparison shows no comparison - the figure above it
   * is unaffected and still true.
   */
  if (before === 0) return null;

  /*
   * (Kept for the record: the branch below used to handle a zero base. It
   * cannot be reached now, and the reasoning is above rather than deleted
   * because "just show 100%" is the obvious next suggestion and it is wrong -
   * a percentage of zero is not a percentage, and "+100%" would be an
   * invention rather than a measurement.)
   */
  const change = now - before;
  const pct = (change / Math.abs(before)) * 100;

  if (change === 0) {
    return <span className="badge w-fit bg-ink-100 text-xs text-ink-600">No change</span>;
  }

  const up = change > 0;
  const good = up === higherIsBetter;

  const pillClass = good ? 'bg-brand-50 text-brand-700' : 'bg-red-50 text-red-700';

  return (
    <span className={`badge tabular w-fit whitespace-nowrap px-2 py-0.5 text-xs ${pillClass}`}>
      <svg viewBox="0 0 12 12" className="h-3 w-3 shrink-0" aria-hidden="true">
        {up ? (
          <path
            d="M2 8.5 5 5.5l2 2L10 4M10 4H7.2M10 4v2.8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <path
            d="M2 3.5 5 6.5l2-2L10 8M10 8H7.2M10 8V5.2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>
      {`${Math.abs(pct).toFixed(1)}%`}
    </span>
  );
}
