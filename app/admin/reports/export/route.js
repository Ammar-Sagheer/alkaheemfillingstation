/**
 * Downloads the monthly report as an Excel workbook.
 *
 * A route handler rather than a Server Action, because the browser needs to
 * receive a file with download headers - an action can only return data.
 *
 * requireRole is the second line of defence as usual; the get_month_export RPC
 * refuses a data_entry caller on its own.
 *
 * ON FAILURE WE REDIRECT, WE DO NOT RETURN TEXT. The download link carries the
 * `download` attribute, so whatever comes back is written straight to disk
 * without being shown. Returning an error message from here therefore saved a
 * junk text file to the owner's Downloads folder and told him nothing. A
 * redirect back to the Reports page cancels the download and puts the reason
 * on screen where he can read it.
 */
import { redirect } from 'next/navigation';

import { requireRole, ROLES, formatDate, todayISO } from '@/app/_lib/helpers';
import { createClient } from '@/app/_lib/supabase-server';
import { buildMonthlyWorkbook, workbookFilename } from '@/app/_lib/excel-report';

function backToReports(month, message) {
  const params = new URLSearchParams({ month, export_error: message });
  return `/admin/reports?${params.toString()}`;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const month = searchParams.get('month') ?? todayISO().slice(0, 7);

  try {
    await requireRole(ROLES.SUPER_ADMIN);
  } catch {
    // Not signed in, or not the owner - the login page is the useful landing.
    redirect('/admin/login');
  }

  if (!/^\d{4}-\d{2}$/.test(month)) {
    redirect(backToReports(todayISO().slice(0, 7), 'Expected a month in the form YYYY-MM.'));
  }

  const [year, monthNumber] = month.split('-').map(Number);
  if (monthNumber < 1 || monthNumber > 12) {
    redirect(backToReports(todayISO().slice(0, 7), 'That is not a real month.'));
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_month_export', {
    p_year: year,
    p_month: monthNumber,
  });

  if (error) {
    return redirect(backToReports(month, `Could not read the month: ${error.message}`));
  }

  let workbook;
  try {
    workbook = await buildMonthlyWorkbook(data, { generatedOn: formatDate(todayISO()) });
  } catch (buildError) {
    // A broken template or a bad cell value must not download a half-written
    // file - a corrupt workbook is worse than no workbook.
    return redirect(backToReports(month, `Could not build the file: ${buildError.message}`));
  }

  return new Response(workbook, {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${workbookFilename(data)}"`,
      'Content-Length': String(workbook.length),
      // A month's figures change as the month is being entered.
      'Cache-Control': 'no-store',
    },
  });
}
