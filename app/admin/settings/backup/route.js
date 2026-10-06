/**
 * Downloads the whole book as one JSON file.
 *
 * NOT THE SAME THING AS THE EXCEL EXPORT beside it, and the difference is worth
 * being clear about because they look like neighbours on the page. The workbook
 * is a REPORT: one month, laid out for reading, and there is no way back from it
 * into a database. This is a BACKUP: every table, every row, in the shape the
 * restore script expects. Nobody reads it; it sits somewhere safe until the day
 * the Supabase project is gone.
 *
 * A route handler rather than a Server Action for the same reason as the
 * workbook: an action returns data to the page, and what is wanted here is a
 * file with download headers.
 *
 * On failure it redirects back to Reports rather than returning text - the link
 * carries `download`, so anything returned is written straight to disk without
 * being read, and an error message would land in Downloads as a junk file
 * saying nothing. See the note on the export route.
 *
 * WHAT IS IN IT, and what is not, is decided by `export_everything()` in
 * migration 051: everything except the activity log's rows (deliberately - it
 * is the largest table and nothing depends on it) and the profiles' own rows
 * (they are half of a login; the other half lives in auth.users, which is
 * Supabase's). The names behind the entries ARE in the file, so a restore can
 * put them back against the new project's logins.
 */
import { redirect } from 'next/navigation';

import { requireRole, ROLES, todayISO, backupAllowed } from '@/app/_lib/helpers';
import { createClient } from '@/app/_lib/supabase-server';

/*
 * Back to Settings, which is where the button is: a failure has to land on the
 * page the reader pressed it from, or the message appears somewhere they are
 * not looking.
 */
function backToSettings(message) {
  const params = new URLSearchParams({ backup_error: message });
  return `/admin/settings?${params.toString()}`;
}

export async function GET() {
  if (!backupAllowed()) {
    return new Response('Not found', { status: 404 });
  }

  try {
    await requireRole(ROLES.SUPER_ADMIN);
  } catch {
    redirect('/admin/login');
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('export_everything');

  if (error) {
    redirect(backToSettings(`Could not read the data: ${error.message}`));
  }

  /*
   * Pretty-printed on purpose, despite being a machine's file. It is opened by
   * a worried person on the worst day, and a wall of one-line JSON is
   * unreadable at exactly the moment somebody needs to satisfy themselves that
   * the readings really are in there. The whole book is a few hundred KB; the
   * indentation costs nothing worth counting.
   */
  const body = JSON.stringify(data, null, 2);

  return new Response(body, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="pump-backup-${todayISO()}.json"`,
      'Content-Length': String(Buffer.byteLength(body)),
      'Cache-Control': 'no-store',
    },
  });
}
