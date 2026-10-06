import { getSessionProfile } from '@/app/_lib/helpers';
import AdminSidebar from '@/app/_components/admin/AdminSidebar';

/**
 * Shell for everything under /admin.
 *
 * The gating happens in three places, deliberately:
 *   1. proxy.js turns away anyone not signed in before they reach here
 *   2. each page calls requirePageRole() for the role it needs
 *   3. RLS in the database refuses the query regardless
 *
 * This layout only decides what to draw. When there is no profile it renders
 * the page bare - that is the login screen, which lives under /admin/login and
 * therefore shares this layout. Checking for a session here as well would send
 * the login page redirecting to itself.
 *
 * The sidebar is fixed rather than a flex sibling, so a long page scrolls under
 * a nav that stays put. `.nav-offset` is what keeps the content clear of it.
 *
 * `.nav-offset` is that padding, and it is a class in globals.css rather than
 * a Tailwind variant because four elements in three files have to agree about
 * whether the column is standing there - and the reader can now pin it open or
 * put it away, so it is not a question a breakpoint can answer alone.
 *
 * THE CONTENT CAP IS 85rem (1360px), SIZED FOR THE 1600x900 LAPTOP this is read
 * on. It was `max-w-6xl` (1152px), which on that screen left 104px of empty
 * page down each side while the widest tables - the Sale & Stock Register, the
 * daily sales table, the month export - scrolled sideways inside themselves to
 * fit. 1600 minus the 240px sidebar is 1360, so 85rem uses exactly what is
 * there and nothing is left over to waste.
 *
 * Not wider than that on purpose. A bigger monitor gains nothing from a longer
 * line of prose, and the app is read by one man on one laptop; 1360 is the
 * screen it is for, not a number chosen to fill whatever is plugged in.
 *
 * `ReadingsCashUpBar` carries the same cap so the fixed bar lines up with the
 * content above it. The two have to move together.
 */
export default async function AdminLayout({ children }) {
  const profile = await getSessionProfile();

  if (!profile) {
    return children;
  }

  return (
    <div className="nav-offset min-h-screen">
      <AdminSidebar profile={profile} />
      <main className="mx-auto w-full max-w-[85rem] px-4 py-4 sm:py-6">{children}</main>
    </div>
  );
}
