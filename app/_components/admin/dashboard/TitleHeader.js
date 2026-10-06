import Icon from '@/app/_components/ui/Icon';
import Button from '@/app/_components/ui/Button';

import { TILE, WASH } from '@/app/_components/admin/dashboard/tones';

/**
 * The top of a page that is not about one day: the page's name as the h1,
 * one line on what it is for, and its actions.
 *
 * `DayHeader`'s counterpart - the same panel, the same padding and the same
 * place for buttons, so a reader moving from Readings to Customers sees one
 * header that changed its words, not two designs. What it does not carry is
 * a day: no date, no relative label, no arrows, and not the slate wash that
 * means "a past day" there (see WASH in ./tones.js).
 *
 * It replaces the old `<PageHeader>`, whose title sat bare on the page canvas
 * with nothing to say where the page began.
 *
 *   `icon` / `tone`  the page's glyph, in the tile, in its meaning colour
 *   `back`           { href, label } for a page under another one - the
 *                    customer's own page, the rate history, the report
 *                    subpages - drawn above the title as a BUTTON, "Back to
 *                    customers". It was a small green text link, and the
 *                    owner could not see it as the way out ("make this back
 *                    to customers button and make it more prominent"). An
 *                    outlined button in the brand green, with the arrow and a
 *                    full-size tap target, reads as a control on a tablet
 *                    without competing with the page's own filled action.
 *   `children`       the page's actions, in one row that wraps
 */
export default function TitleHeader({
  title,
  description,
  icon,
  tone = 'neutral',
  back,
  children,
}) {
  return (
    <header
      data-card
      className="panel @container overflow-hidden"
      style={{ backgroundImage: WASH[tone] ?? WASH.neutral }}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4 px-5 py-5 @[40rem]:px-7 @[40rem]:py-6">
        <div className="min-w-0">
          {back ? (
            <div className="mb-4">
              <Button
                href={back.href}
                pending
                color="primary"
                size="large"
                sx={{
                  borderWidth: 2,
                  borderColor: 'primary.main',
                  fontWeight: 700,
                  '&:hover': { borderWidth: 2, borderColor: 'primary.dark' },
                }}
              >
                <Icon name="chevronRight" className="h-5 w-5 rotate-180" />
                {back.label}
              </Button>
            </div>
          ) : null}
          <div className="flex min-w-0 items-center gap-4">
            <span className={`icon-tile h-12 w-12 ${TILE[tone] ?? TILE.neutral}`}>
              <Icon name={icon} className="h-6 w-6" />
            </span>
            <h1 className="min-w-0 text-2xl font-bold tracking-tight text-ink-900 @[34rem]:text-3xl">
              {title}
            </h1>
          </div>
          {/* Under the title's row rather than beside the tile on a phone,
              where the tile's 64px of indent turned one sentence into four
              lines under a customer's name; indented to the title's edge once
              the header has the width for it. `ps-`, the logical side, so the
              Urdu guide indents from the right. */}
          {description ? (
            <p className="mt-2 max-w-[70ch] text-base text-ink-700 @[40rem]:ps-16">{description}</p>
          ) : null}
        </div>

        {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
      </div>
    </header>
  );
}
