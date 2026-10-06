import Icon from '@/app/_components/ui/Icon';

import { TILE } from '@/app/_components/admin/dashboard/tones';

/**
 * The heading that opens a zone of the new Dashboard - Fuel, Lubricants,
 * Trends - with its icon tile, one line saying what the zone covers, and
 * anything that controls the zone (the chart window) at the right.
 *
 * A HEADING, NOT A CAPTION. 20px bold near-black: the same size the zone
 * headings settled on when the page was grouped into zones, and for the same
 * reason - a heading typeset like a small uppercase caption stops reading as a
 * heading, which the owner reported in as many words (docs/UI_CONVENTIONS.md ->
 * "A heading must not be typeset like a caption"). What is new is the tile
 * beside it, which gives each zone a shape the eye can find while scrolling,
 * and the description, which says which SPAN the figures below it cover - a
 * page that steps through time has to.
 *
 * The pause between zones is the gap above this (the caller's margin) and the
 * tile, rather than the hairline rule the old zones used.
 */
export default function SectionHeader({ id, icon, tone = 'neutral', title, description, children }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      {/* items-start, the tile level with the title: when the title or the
          line under it wraps on a phone, a centred tile floats beside the
          middle of the block instead of beside the heading it belongs to. */}
      <div className="flex min-w-0 items-start gap-3.5">
        <span className={`icon-tile h-11 w-11 ${TILE[tone] ?? TILE.neutral}`}>
          <Icon name={icon} className="h-6 w-6" />
        </span>
        <div className="min-w-0">
          <h2 id={id} className="text-xl font-bold tracking-tight text-ink-900">
            {title}
          </h2>
          {description ? (
            <p className="mt-0.5 max-w-[70ch] text-base text-ink-600">{description}</p>
          ) : null}
        </div>
      </div>
      {/* Full width once it has wrapped under the heading, so a control in it
          can span the zone on a phone; its own width beside the heading. Needs
          the zone to be an `@container`, which every caller's section is. */}
      {children ? (
        <div className="flex w-full flex-wrap items-center gap-2 @[48rem]:w-auto">{children}</div>
      ) : null}
    </div>
  );
}
