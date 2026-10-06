import { formatDate } from '@/app/_lib/date-helpers';
import EmptyState from '@/app/_components/ui/EmptyState';
import Icon from '@/app/_components/ui/Icon';
import Button from '@/app/_components/ui/Button';
import DailySalesTable from '@/app/_components/admin/DailySalesTable';
import TitleHeader from '@/app/_components/admin/dashboard/TitleHeader';

/**
 * Every day the pump has traded, a page of days at a time, drawn - in the new
 * look (docs/UI_CONVENTIONS.md -> "The new look"). The way back to Reports is
 * the header's back link, and the table sits in a panel of its own.
 *
 * `page` and `lastPage` are already clamped by the page; `rows` are newest
 * first.
 */
export default function DailySalesView({ rows, from, to, firstDay, page: safePage, lastPage }) {
  return (
    <>
      <TitleHeader
        title="Daily sales"
        icon="reports"
        tone="money"
        back={{ href: '/admin/reports', label: 'Back to reports' }}
        description="Every day since the pump started trading, newest first. Days with nothing entered are shown as zero rather than skipped, so a gap in the book is visible."
      />

      {rows.length === 0 ? (
        <div className="mt-5">
          <EmptyState
            icon="reports"
            title="Nothing recorded yet"
            description="Once a day of readings has been entered it will appear here, and every day after it."
          />
        </div>
      ) : (
        <div className="mt-5">
          <DailySalesTable rows={rows} framed />

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-base text-ink-700">
              <span className="font-semibold text-ink-800">{formatDate(from)}</span> to{' '}
              <span className="font-semibold text-ink-800">{formatDate(to)}</span>
              <span className="mx-1.5" aria-hidden="true">
                ·
              </span>
              trading since{' '}
              <span className="font-semibold text-ink-800">{formatDate(firstDay)}</span>
            </p>

            {lastPage > 1 ? (
              <nav aria-label="Pages" className="flex items-center gap-2">
                <PagerLink
                  href={`/admin/reports/daily?page=${safePage - 1}`}
                  disabled={safePage <= 1}
                  label="More recent days"
                >
                  <Icon name="chevronRight" className="h-5 w-5 rotate-180" />
                  <span className="hidden sm:inline">Newer</span>
                </PagerLink>

                <span className="text-base font-semibold text-ink-800">
                  Page {safePage} of {lastPage}
                </span>

                <PagerLink
                  href={`/admin/reports/daily?page=${safePage + 1}`}
                  disabled={safePage >= lastPage}
                  label="Earlier days"
                >
                  <span className="hidden sm:inline">Older</span>
                  <Icon name="chevronRight" className="h-5 w-5" />
                </PagerLink>
              </nav>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}

/**
 * A page button that is a real link when it goes somewhere and inert when it
 * does not - rather than a link styled to look dead, which is still focusable
 * and still navigates.
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
