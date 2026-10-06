/**
 * Auth gate for every request.
 *
 * Next.js 16 renamed middleware.js to proxy.js - same idea, new name.
 *
 * Two jobs:
 *   1. Refresh the Supabase session cookie. Server Components cannot write
 *      cookies, so if this did not run the session would silently expire.
 *   2. Keep signed-out visitors out of /admin, and signed-in ones off the
 *      login page.
 *
 * This is a coarse gate only - it checks that someone is signed in, not what
 * their role is. Role checks belong in the pages (requirePageRole), the Server
 * Actions (requireRole) and above all in the RLS policies.
 */
import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export default async function proxy(request) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  /*
   * getSession(), NOT getClaims() - and the difference is a network round trip
   * on every single request the app serves.
   *
   * getSession() reads the session out of the request cookies and returns it.
   * It only talks to Supabase when the access token is within the refresh
   * margin of expiring, at which point it exchanges the refresh token and
   * writes the new cookie through setAll above. So job 1 is untouched: the
   * refresh still happens, just once per token lifetime instead of once per
   * page view.
   *
   * getClaims() starts by doing exactly the same read, and then VERIFIES the
   * token - which is where the cost was:
   *
   *   - on a project using the legacy shared JWT secret, the middleware cannot
   *     check an HS256 signature itself, so auth-js falls back to calling
   *     /auth/v1/user. One round trip, every request.
   *   - on a project using asymmetric signing keys it verifies locally, but
   *     it needs the JWKS to do it, and that cache lives on the client
   *     INSTANCE. Middleware builds a fresh client per request, so the cache
   *     is always empty and it fetches /.well-known/jwks.json instead. Also
   *     one round trip, every request.
   *
   * Either way the gate below was waiting on Supabase before Next.js had begun
   * rendering anything - on every navigation, and on every prefetch.
   *
   * WHY DROPPING THE VERIFICATION HERE IS SAFE. This gate decides one thing:
   * whether to redirect to the login page. It is not what protects the data,
   * and it never was - see the note at the top of this file. Someone who
   * hand-crafted a cookie to get past it would reach a page that calls
   * requirePageRole(), which uses getClaims() and does verify, and behind that
   * every query runs under RLS as whoever the database says they are. The
   * worst a forged cookie buys is the chance to be redirected to the login
   * page a moment later than they otherwise would have been.
   *
   * Note this reads `data.session` and never `session.user`. On the server
   * auth-js wraps the user object in a proxy that warns when its properties
   * are read, precisely because they come from an unverified token. Whether
   * the session exists at all is the only thing this gate needs.
   */
  const { data } = await supabase.auth.getSession();
  const isSignedIn = Boolean(data?.session);

  const { pathname } = request.nextUrl;
  const isLoginPage = pathname === '/admin/login';
  const isAdminArea = pathname === '/admin' || pathname.startsWith('/admin/');

  if (isAdminArea && !isLoginPage && !isSignedIn) {
    const url = request.nextUrl.clone();
    url.pathname = '/admin/login';
    // Remember where they were headed so login can send them back.
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (isLoginPage && isSignedIn) {
    const url = request.nextUrl.clone();
    url.pathname = '/admin';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except Next.js internals and static assets - matching those
     * would break the session refresh cookie on image requests for no reason.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
