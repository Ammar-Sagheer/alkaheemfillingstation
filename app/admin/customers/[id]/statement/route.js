/**
 * Downloads one customer's statement of account as a PDF.
 *
 * A route handler and not a Server Action, for the same reason the Excel export
 * is one: an action returns data, and the browser has to receive a file with
 * download headers. `/admin/reports/export/route.js` is the model this follows,
 * including the part that matters most -
 *
 * ON FAILURE WE REDIRECT, WE DO NOT RETURN TEXT. Whatever comes back from a
 * download link is written to disk without being shown, so an error message
 * returned from here lands in the owner's Downloads folder as a junk file that
 * tells him nothing. A redirect back to the customer cancels the download and
 * puts the reason on screen, where `<DownloadNotice>` shows it and then clears
 * itself out of the URL.
 *
 * BOTH ROLES MAY PRINT ONE. Handing a customer the list of what he owes is
 * collecting, which is the counter's job as much as the owner's - it is the same
 * access that lets data entry record the payment that comes back. It reads and
 * writes nothing, and requireRole is the second line of defence behind RLS as
 * always.
 */
import { redirect } from 'next/navigation';

import { requireRole, ROLES, todayISO } from '@/app/_lib/helpers';
import { getCustomerStatement, getLedgerEntriesForStatement } from '@/app/_lib/data-service';
import { buildAccountStatement, statementRange } from '@/app/_lib/customer-statement';
import { buildStatementPdf, statementFilename } from '@/app/_lib/statement-pdf';

function backToCustomer(id, message) {
  const params = new URLSearchParams({ statement_error: message });
  return `/admin/customers/${id}?${params.toString()}`;
}

export async function GET(request, { params }) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);

  try {
    await requireRole(ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY);
  } catch {
    redirect('/admin/login');
  }

  /*
   * `from` and `to` are the period, inclusive, either or both absent. Absent means
   * no limit at that end, so neither is the whole account - the default the button
   * offers. Anything unparseable is IGNORED rather than refused: the statement is
   * still correct without it, and failing a download over a query string the
   * reader never typed would be pedantry. Entered backwards they are swapped,
   * because a URL can be edited by hand and is not a control.
   */
  const { from, to } = statementRange(searchParams.get('from'), searchParams.get('to'));

  const asOf = todayISO();

  let customer;
  let statement;
  try {
    const [summary, entries] = await Promise.all([
      getCustomerStatement(id),
      getLedgerEntriesForStatement(id),
    ]);

    customer = summary?.customer;
    if (!customer) {
      redirect(backToCustomer(id, 'That customer is no longer on the books.'));
    }

    // The balance comes from customer_balance() in Postgres, not from adding the
    // rows up here - the database owns money totals in this app, and this is the
    // same figure the screen the reader just came from was showing.
    statement = buildAccountStatement(entries, {
      asOf,
      balance: Number(summary.balance ?? 0),
      from,
      to,
    });
  } catch (error) {
    // redirect() throws to unwind - let it through rather than reporting it.
    if (error?.digest?.startsWith?.('NEXT_REDIRECT')) throw error;
    redirect(backToCustomer(id, `Could not read the account: ${error.message}`));
  }

  let pdf;
  try {
    pdf = await buildStatementPdf({ customer, statement });
  } catch (error) {
    // A half-written PDF is worse than none - it opens as a broken file and
    // looks like the account is corrupt rather than the download.
    redirect(backToCustomer(id, `Could not build the statement: ${error.message}`));
  }

  return new Response(pdf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${statementFilename(customer, asOf)}"`,
      'Content-Length': String(pdf.length),
      // What is owed changes the moment a payment is recorded.
      'Cache-Control': 'no-store',
    },
  });
}
