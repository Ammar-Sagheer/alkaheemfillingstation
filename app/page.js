import { redirect } from 'next/navigation';

/**
 * There are no public pages - this is an internal tool. Everything lives under
 * /admin, and proxy.js sends anyone who is not signed in to the login page.
 */
export default function HomePage() {
  redirect('/admin');
}
