import { redirect } from 'next/navigation';

/**
 * The drum's old page, kept only to forward.
 *
 * Loose oil sales now sit in the same table as the packed ones on
 * /admin/lubricants, marked and filterable - see the note at the top of that
 * file for why the split was reversed. This route stays because links to it
 * exist outside the app's control: the Dashboard's oil card, a bookmark on the
 * owner's tablet, a WhatsApp message. Deleting it would turn those into a 404
 * with nothing to say what happened.
 *
 * It forwards to the loose-only view rather than the default, so anyone who
 * followed a link expecting the drum still lands on the drum's sales, and
 * carries the date so a link to a particular day still opens that day.
 */
export default async function LooseOilRedirect({ searchParams }) {
  const params = await searchParams;
  const date =
    typeof params?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
      ? params.date
      : null;

  redirect(`/admin/lubricants?kind=loose${date ? `&date=${date}` : ''}`);
}
