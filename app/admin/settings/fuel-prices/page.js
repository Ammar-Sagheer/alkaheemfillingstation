import { requirePageRole, ROLES } from '@/app/_lib/helpers';
import { getFuelPricesPage } from '@/app/_lib/data-service';
import { pageFrom } from '@/app/_components/ui/Pager';
import FuelPricesView from '@/app/_components/admin/settings/FuelPricesView';

export const metadata = { title: 'All fuel rates' };

/**
 * Every rate the pump has ever set, a page at a time.
 *
 * Settings shows the last week and links here for the rest. The rate moves
 * most days, so this list grows by about sixty rows a month and is the one
 * table in the app guaranteed to outgrow a screen - it is paged rather than
 * capped, because an old rate is what a disputed reading gets checked against
 * and there is no date beyond which it stops mattering.
 *
 * The page number is a query string, which means the browser's Back button
 * works through it and a particular page can be linked to or reloaded.
 */
/*
 * EIGHT, SO THE PAGE DOES NOT SCROLL INSIDE ITSELF. 25 rows overran
 * `.table-scroll`'s 70vh cap and the card grew its own scrollbar: a small
 * scrolling box inside a page that scrolls, where the wheel does one or the
 * other depending on where the pointer happens to be. Eight rows clear the cap
 * at every width this app is read at.
 *
 * Even on purpose: the rate for both fuels normally moves together, so an even
 * page keeps a day's petrol and diesel on the same page instead of splitting
 * the pair across the fold.
 */
const PER_PAGE = 8;

export default async function FuelPricesPage({ searchParams }) {
  await requirePageRole(ROLES.SUPER_ADMIN);

  const params = await searchParams;
  const page = pageFrom(params);

  const { rows, total } = await getFuelPricesPage({ page, perPage: PER_PAGE });

  return <FuelPricesView rows={rows} total={total} page={page} perPage={PER_PAGE} />;
}
