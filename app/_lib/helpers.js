/**
 * Server-side role checks, formatting and the small calculations used across
 * the app.
 *
 * IMPORTANT: this module reaches into request cookies via the server Supabase
 * client, so it can only be imported from Server Components and Server Actions.
 * Client Components that need to format a number as they type do it inline with
 * Intl instead - see ReadingForm.
 */
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from './supabase-server';

export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  DATA_ENTRY: 'data_entry',
};

/**
 * Which routes each role may open. The nav uses this to hide what a user
 * cannot reach, but hiding a link is only cosmetic - the real enforcement is
 * the RLS policies in the database, with requireRole() as a second layer.
 */
export const ROUTE_ACCESS = {
  '/admin': [ROLES.SUPER_ADMIN],
  '/admin/readings': [ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY],
  '/admin/lubricants': [ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY],
  // The drum, sold by the rupee. Its own page under Lubricants rather than a
  // nav entry - it is the same job, done from the other end.
  '/admin/lubricants/loose': [ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY],
  '/admin/purchases': [ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY],
  '/admin/stock-checks': [ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY],
  '/admin/customers': [ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY],
  // What the pump owes its suppliers, and paying them out of the safe or the
  // bank: the owner's, like Banking and Treasury (067).
  '/admin/suppliers': [ROLES.SUPER_ADMIN],
  // The owner's own bank money, not pump operations.
  '/admin/banking': [ROLES.SUPER_ADMIN],
  // The cash in the safe on site - the owner's own money too, and the one
  // page where a figure and a drawer full of notes are checked against each
  // other. Owner only for the same reason banking is.
  '/admin/treasury': [ROLES.SUPER_ADMIN],
  '/admin/expenses': [ROLES.SUPER_ADMIN],
  // Attendance is marked at the pump by either role; the rates, the pay and
  // the staff list on the same page are the owner's (802).
  '/admin/salaries': [ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY],
  // The owner's own property, not pump operations - same reasoning as banking.
  '/admin/company-assets': [ROLES.SUPER_ADMIN],
  '/admin/reports': [ROLES.SUPER_ADMIN],
  // The day-by-day sale and stock register. Under Reports rather than in the
  // sidebar while it is still a preview - reached from the Reports page.
  '/admin/reports/register': [ROLES.SUPER_ADMIN],
  '/admin/settings': [ROLES.SUPER_ADMIN],
  // Your own login only. Managing other people's is on this same page, further
  // down, for the owner - see app/admin/account/page.js.
  '/admin/account': [ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY],
  // How to use the app. Open to staff too - the person most likely to need it
  // is a new attendant on their first evening.
  '/admin/guide': [ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY],
};

/** Where a role lands after logging in. */
export function landingPageFor(role) {
  return role === ROLES.SUPER_ADMIN ? '/admin' : '/admin/readings';
}

// ---------------------------------------------------------------------------
// Authentication and roles
// ---------------------------------------------------------------------------

/**
 * The signed-in user's profile, or null.
 *
 * Uses getClaims() to read the verified JWT rather than trusting anything the
 * browser sent, then loads the profile row for the role. A deactivated account
 * is treated as signed out.
 */
/**
 * Wrapped in React's cache() so it runs ONCE PER REQUEST, not once per caller.
 *
 * Every admin navigation was paying for this twice: the layout asks who is
 * signed in so it can draw the sidebar, and then the page asks again through
 * requirePageRole(). Each ask is a claims check plus a select on `profiles`,
 * so two round trips to Supabase happened before a page had started fetching
 * anything it actually wanted to show. Deduped, the second caller gets the
 * first one's answer.
 *
 * This is a per-request memo and nothing more - it is not a cache across
 * requests, and it cannot go stale. A new request, or the same user in another
 * tab, does the lookup again. That matters: it means a staff account that is
 * deactivated is locked out on their very next navigation, which is the one
 * property this function is not allowed to lose.
 */
export const getSessionProfile = cache(async function getSessionProfile() {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, role, is_active')
    .eq('id', claims.sub)
    .single();

  if (!profile || !profile.is_active) return null;

  return { ...profile, email: claims.email ?? null };
});

/**
 * requireRole - the guard to call at the top of EVERY Server Action.
 *
 * Throws rather than redirecting, because an action should fail loudly and let
 * the caller turn it into a message on the form. Pages use requirePageRole()
 * instead, which redirects.
 *
 *   const profile = await requireRole(ROLES.SUPER_ADMIN);
 *   const profile = await requireRole(ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY);
 *
 * This is defence in depth, not the actual protection: even if this check were
 * missing, the RLS policies would still refuse the write.
 */
export async function requireRole(...allowedRoles) {
  const profile = await getSessionProfile();

  if (!profile) {
    throw new Error('You are signed out. Please sign in again.');
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(profile.role)) {
    throw new Error('You do not have permission to do that.');
  }

  return profile;
}

/**
 * Page-level guard: redirects instead of throwing, so a staff member who opens
 * a super_admin URL gets bounced somewhere useful rather than an error screen.
 */
export async function requirePageRole(...allowedRoles) {
  const profile = await getSessionProfile();

  if (!profile) {
    redirect('/admin/login');
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(profile.role)) {
    redirect(landingPageFor(profile.role));
  }

  return profile;
}

// ---------------------------------------------------------------------------
// Formatting
//
// Grouping is en-US style (140,000). If you would rather see the South Asian
// lakh style (1,40,000), change 'en-US' to 'en-IN' in the two formatters below.
// ---------------------------------------------------------------------------

/*
 * `formatPKR` and `roundRupees` LIVE IN format-helpers.js, and are re-exported
 * below. Exactly the arrangement the dates already use, and for the same reason:
 * this module reaches into request cookies and cannot go in a browser bundle,
 * while the statement preview - a client component showing the reader the very
 * figures he is about to print - has to format money the same way the PDF does.
 * A hand-rolled `showMoney` in the component would agree with the file right up
 * until the day it quietly stopped.
 */

/*
 * There WAS a formatPKRExact here, showing the ledger to the paisa on the
 * reasoning that a customer account should account for every last unit.
 *
 * Removed, because Pakistan has no coin below one rupee. Nobody hands over
 * 28 paisa, so a 28-paisa balance is not a debt - it is arithmetic left over
 * from litres times a rate, and it can never be paid off. Showing it made the
 * customer page contradict itself: the headline read "Rs -5,000" through
 * formatPKR while the table under it read "Rs -4,999.72".
 *
 * The ledger now uses formatPKR like everything else, and roundRupees below
 * keeps new paisa from reaching it in the first place. Rounding only the
 * DISPLAY would have been the worse half of the fix - three hidden 0.28s add
 * up to a rupee, and the running balance would drift from the rows above it.
 */

/*
 * Dates live in date-helpers.js so the client forms can import the same
 * implementation - this module cannot go in a browser bundle. Re-exported here
 * so server code carries on importing them from helpers as before.
 */
export {
  todayISO,
  entryDayISO,
  shiftISODate,
  formatDate,
  formatDateLong,
  formatDateTime,
  monthRange,
  formatMonth,
} from './date-helpers';

/*
 * Same arrangement for the formatters the client forms also need - see
 * format-helpers.js.
 */
export {
  formatRate,
  formatLitresFine,
  saleAmount,
  formatLitres,
  formatNumber,
  formatPKR,
  roundRupees,
} from './format-helpers';

/**
 * Whether the "empty everything" button exists on this deployment.
 *
 * Scaffolding for the testing phase, switched on by ALLOW_FULL_RESET=true on
 * the server. Deliberately NOT a NEXT_PUBLIC_ variable: those are baked into
 * the browser bundle at build time, so the flag would ship to anyone who looked.
 * Read here on the server only, by both the Settings page (to decide whether to
 * draw the button) and the action itself (to decide whether to obey it) - the
 * button being hidden is presentation, this check is the actual gate.
 *
 * To retire it for good: delete the variable in Vercel and redeploy. No code
 * change, nothing to remember.
 */
export function fullResetAllowed() {
  return process.env.ALLOW_FULL_RESET === 'true';
}

/**
 * Whether the whole-database backup exists on this deployment.
 *
 * Off unless SHOW_BACKUP=true on the server. This copy is shown to prospective
 * clients, and a "download every record" button is not something a demo
 * visitor should be offered. Server-only for the same reason as
 * fullResetAllowed(): the Settings page uses it to decide whether to draw the
 * panel, and the download route uses it to decide whether to answer - hiding
 * the panel is presentation, the route check is the gate.
 */
export function backupAllowed() {
  return process.env.SHOW_BACKUP === 'true';
}

// ---------------------------------------------------------------------------
// Calculations
//
// The database computes these too, as generated columns. These exist so the
// forms can show a running total as someone types. Postgres remains the source
// of truth - if the two ever disagree, the database is right.
// ---------------------------------------------------------------------------

/** Money is rounded to 2 decimals the same way Postgres rounds it. */
export function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function litresSold(opening, closing) {
  const sold = Number(closing) - Number(opening);
  return Number.isFinite(sold) ? roundMoney(sold) : 0;
}

/*
 * `saleAmount` IS NOT DEFINED HERE. It is re-exported from format-helpers.js at
 * the top of this file, and there was a second, local copy of it sitting here -
 * `roundMoney(litres * rate)`, a binary-double multiply, which is exactly the
 * arithmetic migration 052 exists to remove. Two exports of the same name in one
 * module is a SyntaxError under strict ESM; webpack tolerated it and picked one,
 * so which implementation a caller got was down to the bundler.
 *
 * Nothing imported it from here - every caller reaches into format-helpers.js
 * directly - so this was a trap rather than a live bug. Removed rather than
 * renamed, because the app should have one answer to "what does this fill cost",
 * and it is the one that multiplies as integers.
 */

/** Positive = the customer owes money. */
export function ledgerBalance(entries = []) {
  return roundMoney(
    entries.reduce(
      (total, entry) =>
        total + (entry.entry_type === 'debit' ? Number(entry.amount) : -Number(entry.amount)),
      0,
    ),
  );
}
