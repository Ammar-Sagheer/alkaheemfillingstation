/**
 * A breakdown inside a card - "Sales / Cash / Credit" - as small tiles, each a
 * caption and a figure.
 *
 * Needs an `@container` ancestor (the card), and the one threshold both halves
 * obey lives here, in this file, because the row and the tile have to switch
 * together. Above 36rem of card the tiles sit three across with the caption
 * over the figure; below it each tile becomes a row, caption left and figure
 * right. The figure is nowrap at every width.
 *
 * 36rem, NOT THE 27rem IT WAS FIRST BUILT WITH, and that was measured: a busy
 * day's petrol is a seven-figure sum, and at 27rem a 1024px window gave each of
 * three tiles about 113px of room for "Rs 1,538,860" - which needs about 120 -
 * so the figure ran out of its tile. The render-check sweep caught it; nothing
 * at the ordinary day's six figures would have. Three across needs roughly
 * 3 x (the figure + the tile's padding) plus the gaps and the card's own
 * padding, about 33rem, and 36 leaves room for a wider font than this
 * machine's. Rows are the comfortable fallback, not a squeeze.
 */
export function FigureRow({ children }) {
  return (
    <dl className="mt-4 grid grid-cols-1 gap-2 @[36rem]:grid-cols-3 @[36rem]:gap-3">{children}</dl>
  );
}

export default function FigureTile({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-3 rounded-xl bg-ink-50 px-3.5 py-2.5 ring-1 ring-inset ring-ink-200/70 @[36rem]:block">
      <dt className="caption">{label}</dt>
      <dd className="tabular whitespace-nowrap text-lg font-bold text-ink-900 @[36rem]:mt-0.5">
        {value}
      </dd>
    </div>
  );
}
