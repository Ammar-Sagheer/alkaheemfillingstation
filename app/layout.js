import '@/app/_styles/globals.css';

import { cookies } from 'next/headers';

import { AppRouterCacheProvider } from '@mui/material-nextjs/v16-appRouter';

import AppTheme from '@/app/_components/ui/AppTheme';

import { BUSINESS_NAME } from '@/app/_lib/brand';

export const metadata = {
  title: {
    default: BUSINESS_NAME,
    template: `%s · ${BUSINESS_NAME}`,
  },
  description: 'Daily readings, stock and customer credit for the petrol pump.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  // The daily entry screen is used on a tablet; let it be zoomed.
  maximumScale: 5,
};

/*
 * `data-nav` carries the reader's choice about the sidebar - see the block on
 * it in globals.css. It is read from the cookie HERE, on the server, and
 * written onto <html> in the first response, so the page paints with the right
 * layout instead of painting one and then jumping to the other. Absent, the
 * screen width decides, which is what it did before anybody had a preference.
 */
export default async function RootLayout({ children }) {
  const nav = (await cookies()).get('nav')?.value;

  return (
    <html lang="en" data-nav={nav === 'open' || nav === 'closed' ? nav : undefined}>
      <body className="min-h-screen antialiased">
        {/*
         * Only Material UI's icons use Emotion (see docs/UI_CONVENTIONS.md
         * -> "Icons"). Without this, Emotion injects its <style> tags on the
         * client after hydration instead of during the server render, so the
         * server and client trees disagree on whether a <style> or the <svg>
         * itself comes first - a hydration mismatch on every MUI icon, not
         * a one-off bug in a particular icon.
         */}
        <AppRouterCacheProvider options={{ key: 'mui' }}>
          <AppTheme>{children}</AppTheme>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
