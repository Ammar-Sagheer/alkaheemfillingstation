import Button from '@/app/_components/ui/Button';
import Icon from '@/app/_components/ui/Icon';
import DateJump from '@/app/_components/admin/DateJump';
import { formatDate } from '@/app/_lib/helpers';

/**
 * Moving between days on the treasury sheet.
 *
 * NOT `<Pager>`, and not `<DateNav>` either, though it borrows from both.
 *
 * `<Pager>` counts rows - "showing 1 to 25 of 36" - and the unit here is a
 * day (migration 047). `<DateNav>` steps the calendar one day at a time, which
 * is right on Readings where every day is a day the pump traded, and wrong
 * here: the safe is written in on the days cash moves, so stepping the
 * calendar would land on days with nothing on them. **The arrows go to the
 * neighbouring days that HAVE entries**, which the RPC works out; at either
 * end the arrow has nothing to point at and is a disabled button rather than a
 * link, the same rule `<Pager>` follows.
 *
 * The date box is `<DateJump>`, unchanged, so picking a day goes straight to
 * it - and because the RPC resolves a day with no entries to the nearest one
 * that has some, any date picked lands somewhere real.
 *
 * Older on the left, newer on the right, because the sheet reads newest-first
 * and the left arrow is "back" everywhere else in the app.
 *
 * `hrefForDay` rather than a base path, for the reason `<Pager>` gives about
 * `hrefFor`: this page carries the chart's window in the same query string,
 * and a link that rebuilt the URL from scratch would silently drop it.
 */
export default function TreasuryDayNav({
  day,
  prevDay,
  nextDay,
  dayIndex,
  dayCount,
  hrefForDay,
  carried = {},
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-ink-600">
        Day <span className="font-semibold text-ink-800">{dayIndex}</span> of{' '}
        <span className="font-semibold text-ink-800">{dayCount}</span>
        {dayCount > 1 ? (
          <>
            <span className="mx-1.5" aria-hidden="true">
              ·
            </span>
            newest first
          </>
        ) : null}
      </p>

      <nav aria-label="Days with entries" className="flex flex-wrap items-center gap-2">
        <DayLink
          href={prevDay ? hrefForDay(prevDay) : null}
          label={prevDay ? `Go to ${formatDate(prevDay)}` : 'No earlier day'}
        >
          <Icon name="chevronRight" className="h-5 w-5 rotate-180" />
          <span className="hidden sm:inline">Earlier</span>
        </DayLink>

        {/* `carried` is the chart's window. Without it, stepping a day would
            silently reset the chart to its default - the same reason DateNav
            carries extraParams through its own arrows. */}
        <DateJump date={day} basePath="/admin/treasury" extraParams={carried} scroll={false} />

        <DayLink
          href={nextDay ? hrefForDay(nextDay) : null}
          label={nextDay ? `Go to ${formatDate(nextDay)}` : 'No later day'}
        >
          <span className="hidden sm:inline">Later</span>
          <Icon name="chevronRight" className="h-5 w-5" />
        </DayLink>
      </nav>
    </div>
  );
}

/**
 * An arrow that is a real link when there is a day to go to and a disabled
 * button when there is not - rather than a link styled to look dead, which is
 * still focusable and still navigates. Lifted from `<Pager>`'s PagerLink for
 * that reason.
 */
function DayLink({ href, label, children }) {
  if (!href) {
    return (
      <Button variant="secondary" disabled aria-disabled="true" aria-label={label}>
        {children}
      </Button>
    );
  }

  return (
    /*
     * STAY WHERE THE READER IS. A Link resets the scroll to the top by
     * default, which is right when the whole page changes and wrong here: the
     * sheet is the last thing on this page, so stepping a day threw the reader
     * back up past the tiles, the chart and both breakdowns to look at a table
     * they were already looking at. Same reasoning, and the same one-word fix,
     * as `<TrendWindow>` above the chart.
     *
     * `scroll` is not a prop `Button` knows about; MUI forwards what it does
     * not recognise to the component it renders as, which here is PendingLink,
     * which spreads onto Next's Link, which consumes it. It never reaches the
     * DOM, so there is no unknown-attribute warning.
     */
    <Button variant="secondary" href={href} pending scroll={false} aria-label={label}>
      {children}
    </Button>
  );
}
