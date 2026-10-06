/**
 * The business's own name and mark, in one place.
 *
 * Plain constants with no imports, so this can be pulled into a Server
 * Component, a Client Component and the Excel report alike - unlike helpers.js,
 * which reaches into request cookies and is server-only.
 *
 * Changing BUSINESS_NAME here changes the navbar, the login screen, every
 * browser tab title and the monthly workbook together. It was three separate
 * copies of "Pump Manager" before, which is how a rename ends up half done.
 */
export const BUSINESS_NAME = 'Al Hakeem Filling Station PSO';

/** Shown when the logo file is missing, so the header is never empty. */
export const BUSINESS_INITIALS = 'AH';

/**
 * Where the logo lives. Anything Next serves from /public works - drop a file
 * in as public/logo.png and it appears; take it away and the initials come
 * back. No code change either way.
 */
export const LOGO_SRC = '/logo.png';
