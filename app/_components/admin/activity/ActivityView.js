import EmptyState from '@/app/_components/ui/EmptyState';
import PendingLink from '@/app/_components/ui/PendingLink';
import Pager from '@/app/_components/ui/Pager';
import ActivityTable from '@/app/_components/admin/ActivityTable';
import ClearOldActivityButton from '@/app/_components/admin/ClearOldActivityButton';
import TitleHeader from '@/app/_components/admin/dashboard/TitleHeader';
import SectionHeader from '@/app/_components/admin/dashboard/SectionHeader';

/**
 * Everything anyone has done, newest first, drawn - in the new look
 * (docs/UI_CONVENTIONS.md -> "The new look").
 *
 * WHAT THIS IS FOR. The owner has staff logins, and the app lets a past day be
 * corrected - which is necessary and is also the shape of a mistake being
 * quietly tidied away. This does not prevent anything; it means the question
 * "who changed that" can be answered. Every sentence in the table was written
 * by the database at the moment the change happened (migration 035); this
 * only lays them out.
 */
export default function ActivityView({ rows, total, page, perPage, who, profiles, trimCounts }) {
  /* The filter has to survive turning the page, and the page number has to be
     dropped when the filter changes - staying on page 4 of a list that just
     became six rows long shows an empty table and looks broken. */
  const hrefFor = (n) => `/admin/activity?page=${n}${who ? `&who=${who}` : ''}`;
  const filterHref = (id) => (id ? `/admin/activity?who=${id}` : '/admin/activity');

  const chosen = who ? profiles.find((profile) => profile.id === who) : null;

  return (
    <>
      <TitleHeader
        title="Activity"
        icon="activity"
        tone="neutral"
        description="Who entered, changed or removed what, and when. Written by the database itself, and nobody can edit it, including you."
      >
        {/* The one thing that may be done TO the log rather than read from it:
            the old end can be thrown away in whole periods. Not shown at all
            when nothing is old enough for it to mean anything - see
            ClearOldActivityButton for why that is still append-only. */}
        {trimCounts ? <ClearOldActivityButton counts={trimCounts} /> : null}
      </TitleHeader>

      <section aria-labelledby="trail-heading" className="@container mt-10">
        <SectionHeader
          id="trail-heading"
          icon="list"
          tone="neutral"
          title={chosen ? `By ${chosen.full_name}` : 'Everyone'}
          description="Newest first. When an entry was filed against an earlier day, it says which."
        >
          {/* Only worth drawing with more than one login to choose between.
              The Dashboard's segmented control; the chosen one is a <span>,
              not a link, for the reason `<Pager>` gives - a link styled to look
              inert still takes focus and navigates to where you already are. */}
          {profiles.length > 1 ? (
            <div role="group" aria-label="Whose activity to show" className="seg">
              <PersonChoice href={filterHref(null)} active={!who}>
                Everyone
              </PersonChoice>
              {profiles.map((profile) => (
                <PersonChoice
                  key={profile.id}
                  href={filterHref(profile.id)}
                  active={who === profile.id}
                >
                  {profile.full_name}
                </PersonChoice>
              ))}
            </div>
          ) : null}
        </SectionHeader>

        {rows.length === 0 ? (
          <EmptyState
            icon="activity"
            title={who ? 'Nothing recorded for this person yet' : 'Nothing recorded yet'}
            description="The trail starts from the day this was switched on, so anything entered before that is not in it. The next reading, payment or price change will appear here."
          />
        ) : (
          <>
            <ActivityTable rows={rows} />
            <Pager
              page={page}
              perPage={perPage}
              total={total}
              hrefFor={hrefFor}
              label="Activity pages"
            />
          </>
        )}
      </section>
    </>
  );
}

/**
 * One choice in the filter: the Dashboard's `.seg` control, with one change.
 * `.seg-item` never wraps, which is right for "7 days" and wrong for a
 * person's full name: "Muhammad Abdul Rehman Qureshi" was wider than a 320px
 * phone and pushed the whole page sideways. A name wraps inside its choice,
 * and only once it cannot fit on a line of its own.
 */
function PersonChoice({ href, active, children }) {
  if (active) {
    return (
      <span aria-current="true" className="seg-item-active whitespace-normal text-left">
        {children}
      </span>
    );
  }
  return (
    <PendingLink href={href} scroll={false} className="seg-item whitespace-normal text-left">
      {children}
    </PendingLink>
  );
}
