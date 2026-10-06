/**
 * Supabase client for the BROWSER.
 *
 * Only used by Client Components that need interactivity (the login form, the
 * customer picker). Everything that reads or writes real data goes through the
 * server client or a Server Action instead.
 *
 * The key here is public on purpose - it identifies the project, it does not
 * grant access. RLS policies are what actually protect the data.
 */
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
