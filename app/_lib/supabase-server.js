/**
 * Supabase client for SERVER Components, Server Actions and route handlers.
 *
 * This client carries the signed-in user's session from the request cookies, so
 * every query it makes runs as that user and RLS applies. This is the one to
 * reach for by default.
 *
 * Note it is async: `cookies()` must be awaited in the App Router.
 */
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Components are not allowed to set cookies. That is fine:
            // proxy.js refreshes the session on every request, so the cookie is
            // already up to date by the time we get here.
          }
        },
      },
    },
  );
}
