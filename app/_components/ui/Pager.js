import Icon from '@/app/_components/ui/Icon';
import Button from '@/app/_components/ui/Button';

/**
 * The row under a paged table: how much of it you are looking at, and the way
 * to the rest.
 *
 * Every table in this app that keeps growing gets one of these. A pump records
 * a few rows a day, which is nothing for a week and four hundred rows by the
 * end of a year - and a four-hundred-row table is not a table any more, it is a
 * scroll. The page number lives in the query string so the browser's Back
 * button walks back through it and a particular page can be reloaded or
 * bookmarked.
 *
 * `hrefFor(page)` rather than a base path, because these tables already carry
 * other query parameters - a date, a month, a customer - and a pager that
 * rebuilt the URL from scratch would silently drop them.
 *
 * WHAT COUNTS AS "GROWING". A table scoped to one day or one month is bounded
 * by how much can happen in that time and does not need this. A table that
 * shows everything since the pump opened does, however slow the growth.
 */
export default function Pager({ page, perPage, total, hrefFor, label = 'Pages' }) {
  const lastPage = Math.max(1, Math.ceil(total / perPage));
  const first = total === 0 ? 0 : (page - 1) * perPage + 1;
  const last = Math.min(page * perPage, total);

  return (
    /* The count sits outside the nav so it still reads as a sentence when
       there is only one page and there are no buttons beside it. */
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      {/* 16px, the body size: every table it sits under is on a new-look page
          now, where 14px is for captions and this is a sentence. */}
      <p className="text-base text-ink-700">
        Showing <span className="font-semibold text-ink-800">{first}</span> to{' '}
        <span className="font-semibold text-ink-800">{last}</span> of{' '}
        <span className="font-semibold text-ink-800">{total}</span>
      </p>

      {lastPage > 1 ? (
        <nav aria-label={label} className="flex items-center gap-2">
          <PagerLink href={hrefFor(page - 1)} disabled={page <= 1} label="Previous page">
            <Icon name="chevronRight" className="h-5 w-5 rotate-180" />
            <span className="hidden sm:inline">Previous</span>
          </PagerLink>

          <span className="text-base font-semibold text-ink-800">
            Page {page} of {lastPage}
          </span>

          <PagerLink href={hrefFor(page + 1)} disabled={page >= lastPage} label="Next page">
            <span className="hidden sm:inline">Next</span>
            <Icon name="chevronRight" className="h-5 w-5" />
          </PagerLink>
        </nav>
      ) : null}
    </div>
  );
}

/**
 * A page button that is a real link when it goes somewhere and a disabled
 * span when it does not - rather than a link styled to look dead, which is
 * still focusable and still navigates.
 */
function PagerLink({ href, disabled, label, children }) {
  if (disabled) {
    return (
      <Button variant="secondary" disabled aria-disabled="true">
        {children}
      </Button>
    );
  }

  return (
    <Button variant="secondary" href={href} pending aria-label={label}>
      {children}
    </Button>
  );
}

/**
 * Reads `?page=` off a searchParams object and clamps it to something sane.
 *
 * Kept beside the component because every page that renders a Pager needs the
 * same three lines, and "1" is the right answer for a missing value, a zero, a
 * negative, and whatever a hand-edited URL contains.
 */
export function pageFrom(params) {
  const requested = Number.parseInt(params?.page, 10);
  return Number.isInteger(requested) && requested > 0 ? requested : 1;
}
