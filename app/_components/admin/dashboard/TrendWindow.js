import PendingLink from '@/app/_components/ui/PendingLink';

/*
 * FOUR FIXED WINDOWS RATHER THAN TWO DATE BOXES. The charts already end on the
 * day the page is showing, so the only thing missing is how far back from it
 * to go - and asked as a from/to pair that is two date pickers, four taps and
 * a way to enter a range that is backwards or empty. One tap, no invalid
 * states, and the day the window ends on is still whatever the rest of the
 * page is showing (docs/UI_CONVENTIONS.md -> "Filtering a chart: fixed
 * windows, not a date range").
 *
 * The four are the questions actually asked of this pump: last week, the
 * fortnight the charts always showed, the month, the quarter. 90 days is the
 * longest a daily bar stays readable at this width - beyond that the bars are
 * hairlines and a month-by-month view would be the right answer instead.
 *
 * These lived beside the old `<TrendRange>` chips, which this control replaced
 * on every page; they moved here with the last of its callers.
 */
export const TREND_WINDOWS = [7, 14, 30, 90];

export const DEFAULT_TREND_DAYS = 14;

/** Reads `?days=` and falls back to the default rather than trusting it. */
export function trendDaysFrom(params) {
  const asked = Number(params?.days);
  return TREND_WINDOWS.includes(asked) ? asked : DEFAULT_TREND_DAYS;
}

/**
 * How far back the charts look - 7 / 14 / 30 / 90 days - as a segmented
 * control in the new look, on the Dashboard and on Treasury.
 *
 * The chosen window is a `<span>` with aria-current, not a link to the page
 * already open (a link styled to look inert is still focusable and still
 * navigates); and the others do not scroll the page, because the charts are
 * the last thing on it and a filter that changes only what is beside it must
 * not move the reader.
 */
export default function TrendWindow({ days, hrefFor }) {
  /* A grid on a phone - two by two, then four across - because as a wrapping
     row it broke three and one, "90 days" alone on a second line. A row of its
     own beside the heading once the zone has room (48rem, the same point
     SectionHeader lets it sit on the right). The container is the section. */
  return (
    <div
      role="group"
      aria-label="How far back the charts look"
      className="seg grid w-full grid-cols-2 @[30rem]:grid-cols-4 @[48rem]:inline-flex @[48rem]:w-auto"
    >
      {TREND_WINDOWS.map((window) =>
        window === days ? (
          <span key={window} aria-current="true" className="seg-item-active">
            {window} days
          </span>
        ) : (
          <PendingLink key={window} href={hrefFor(window)} scroll={false} className="seg-item">
            {window} days
          </PendingLink>
        ),
      )}
    </div>
  );
}
