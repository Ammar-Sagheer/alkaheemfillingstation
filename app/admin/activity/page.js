import { requirePageRole, ROLES } from '@/app/_lib/helpers';
import { getActivityLog, getActivityTrimCounts, getProfiles } from '@/app/_lib/data-service';
import { pageFrom } from '@/app/_components/ui/Pager';
import ActivityView from '@/app/_components/admin/activity/ActivityView';

export const metadata = { title: 'Activity' };

/*
 * Twenty a page. A log is read by scanning rather than by reading, so it wants
 * more rows than the eight that suit the rate history - and unlike that one,
 * the rows here are tall and uneven, since a line carries its own change list.
 * Twenty fills a laptop screen without the page becoming a mile of scrolling.
 */
const PER_PAGE = 20;

/**
 * Everything anyone has done: the role check and the queries. `ActivityView`
 * draws it, in the new look, and says what the page is for.
 *
 * OWNER ONLY, twice over: requirePageRole here, and the row-level policy on
 * activity_log, which is the one that actually decides. A staff login that
 * typed this URL would get past neither, but it is the policy that would stop
 * them if this line were ever deleted by accident.
 */
export default async function ActivityPage({ searchParams }) {
  await requirePageRole(ROLES.SUPER_ADMIN);

  const params = await searchParams;
  const page = pageFrom(params);
  const who = typeof params?.who === 'string' ? params.who : null;

  const [{ rows, total }, profiles, trimCounts] = await Promise.all([
    getActivityLog({ page, perPage: PER_PAGE, who }),
    getProfiles(),
    getActivityTrimCounts(),
  ]);

  return (
    <ActivityView
      rows={rows}
      total={total}
      page={page}
      perPage={PER_PAGE}
      who={who}
      profiles={profiles}
      trimCounts={trimCounts}
    />
  );
}
