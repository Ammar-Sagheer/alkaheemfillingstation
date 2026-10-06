/**
 * Formatting that has to be identical on the server AND in the browser.
 *
 * Lives apart from helpers.js for the same reason date-helpers.js does: that
 * module reads request cookies for the role checks, so it can never be pulled
 * into a client bundle - which left client components writing their own
 * formatting inline, and drifting. helpers.js re-exports what is here, so
 * server code carries on importing from there.
 */

/**
 * A per-litre rate, always to the paisa: 339.5 -> "Rs 339.50".
 *
 * Deliberately NOT formatPKR, which rounds to whole rupees. That is right for
 * a day's takings, where the paisa are noise beside Rs 140,000 - and wrong for
 * a rate, where the whole figure is three digits and the paisa are part of the
 * price on the board outside. Rs 339.48 shown as "Rs 339" is a different price.
 *
 * Both minimum and maximum are 2, so a round rate shows as "Rs 339.00" rather
 * than "Rs 339" - a price list where some rows carry paisa and others do not
 * reads as though the app dropped them on the ones that do not.
 */
const rateFormat = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatRate(value) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 'Rs 0.00';
  return `Rs ${rateFormat.format(n)}`;
}

/**
 * Litres to the millilitre: 0.0345 -> "0.035 L".
 *
 * For loose oil only. `formatLitres` stops at two decimals, which is right for
 * a shelf - "4 L", "0.25 L" - but turns every rupee-priced pour out of a drum
 * into "0.03 L", and two sales of different sizes into the same string. The
 * third decimal is not decoration here; it is the difference between the
 * figures.
 *
 * Trailing zeros are kept off, so a whole litre off the drum still reads "1 L"
 * rather than "1.000 L".
 */
const fineLitreFormat = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
});

export function formatLitresFine(value) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return '0 L';
  return `${fineLitreFormat.format(n)} L`;
}

/**
 * Litres × rate, to the paisa, computed the way POSTGRES computes it.
 *
 * THIS EXISTS BECAUSE A READING WOULD NOT SAVE. Unit 1 Nozzle A on 23 Aug:
 * opening 1,990,670.61, closing 1,990,868.36, diesel at Rs 371.90. That is
 * 197.75 litres, and 197.75 × 371.90 is exactly Rs 73,543.2250 - a half-paisa,
 * dead on the rounding boundary.
 *
 *   Postgres  numeric, exact:   73543.2250 -> round(...,2) -> 73543.23
 *   JavaScript float:           73543.224999999991...      -> 73543.22
 *
 * `sale_amount` is a GENERATED column, so the database computes .23 and the app
 * sent .22, and the check constraint that cash + credit must equal the amount
 * sold refused the row - by one paisa, with a message about the figures not
 * adding up that no amount of re-typing could fix. Whole litres never hit it:
 * a whole number × a two-decimal rate cannot land on a half-paisa. The owner's
 * decimals could, and did.
 *
 * The fix in the DATABASE is migration 052, which derives cash inside
 * `create_nozzle_reading()` instead of trusting what the app worked out - the
 * same reasoning that already had it derive the credit total from the slips.
 * This function is the other half: what the SCREEN shows while the reading is
 * being typed has to be the figure that is about to be saved, or the owner
 * checks Rs 73,543.22 against the drawer and the books say .23.
 *
 * HOW. Scale both sides to integers, multiply exactly, then round half AWAY
 * FROM ZERO on the paisa - which is what Postgres `round()` does, and what
 * `roundRupees` in helpers.js already matches for the ledger.
 *
 * Litres are scaled by a THOUSAND, not a hundred. A meter reading is two
 * decimals so a nozzle's litres are too, but loose oil is measured to three
 * (`lubricant_sales.litres` is `numeric(12,3)`), and a helper that silently
 * rounded 12.345 litres to 12.35 before multiplying would be a worse bug than
 * the one it was written to fix - quiet, and only on the drum. The widest real
 * input, a six-figure litre count at a three-figure rate, is about 1e13: an
 * exact integer in a double, three orders of magnitude clear of 2^53.
 *
 * Never `litres * rate` in floating point again for a figure the database also
 * computes.
 */
export function saleAmount(litres, rate) {
  const l = Math.round(Number(litres) * 1000);
  const r = Math.round(Number(rate) * 100);
  if (!Number.isFinite(l) || !Number.isFinite(r)) return 0;

  // Scaled by 100,000: three decimals of litres, two of rate.
  const scaled = l * r;
  const sign = scaled < 0 ? -1 : 1;
  const abs = Math.abs(scaled);

  // The last three digits are the fraction of a paisa; half rounds up.
  const paisa = Math.floor(abs / 1000) + (abs % 1000 >= 500 ? 1 : 0);
  return (sign * paisa) / 100;
}

/**
 * Add up money exactly, by adding paisa rather than rupees.
 *
 * The same reasoning as `saleAmount` above, one step along: a column of figures
 * carrying paisa drifts in binary floating point, and the drift is invisible
 * until it lands on a boundary. `0.1 + 0.2` is the schoolbook example; the one
 * that matters here is a statement footer, where twenty fills at Rs 73,543.23
 * have to reach the figure Postgres reached over the same rows, and a page whose
 * lines come to one paisa short of its own total is a page someone will argue
 * with.
 *
 * Every money column in this app is `numeric(_, 2)`, so scaling by 100 makes
 * every input an exact integer, and integers add exactly in a double until 2^53
 * - about ninety thousand billion rupees.
 *
 * This is for adding up rows the app is already holding, which is a different
 * thing from working out a figure the DATABASE also works out. That one is still
 * the database's job: see CLAUDE.md, and `balance_after` in migration 064.
 */
export function sumMoney(values) {
  let paisa = 0;
  for (const value of values) {
    const number = Number(value);
    if (!Number.isFinite(number)) continue;
    paisa += Math.round(number * 100);
  }
  return paisa / 100;
}

// ---------------------------------------------------------------------------
// Litres and plain counts.
//
// Moved here from helpers.js when the nozzle wiring dialog needed to show a
// replaced pump's starting meter: that dialog is a client component, and
// helpers.js reads request cookies for the role checks, so importing it into
// the browser bundle fails the build outright. Grouping is en-US style
// (140,000); for the South Asian lakh style (1,40,000) change 'en-US' to
// 'en-IN' here and in helpers.js's money formatter.
// ---------------------------------------------------------------------------
const numberFormat = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/**
 * "Formula 20W-50" with a NON-BREAKING hyphen (U+2011) in the grade, so a
 * narrow cell cannot end a line at "20W-" and start the next with "50" - which
 * reads as two things, the way "Rs" alone at the end of a line does. Only a
 * hyphen with a letter or digit on both sides is swapped; it looks the same.
 * For product names shown in a table, never for text that is saved.
 */
export function nonBreakingHyphens(text) {
  return String(text ?? '').replace(/([0-9A-Za-z])-(?=[0-9A-Za-z])/g, '$1\u2011');
}

/**
 * Text the DATABASE wrote, with its em dashes taken out for the screen.
 *
 * The owner asked for no em dashes on any page (September 2026). The app's own
 * words were rewritten; these are the ones it cannot rewrite in place: the
 * activity log's sentences, stored as the trigger wrote them with " \u2014 "
 * between a name and a figure (migrations 035 onwards), and a refusal raised
 * by Postgres and passed straight through to a form. Changing the SQL would
 * leave every line already stored as it was, so the change is made here,
 * where old and new are both read.
 *
 *   joiner  what stands where the dash was: ' \u00b7 ' between a name and a
 *           figure (the app's own separator), ': ' inside a sentence.
 *
 * Anything that is not a string comes back untouched, so an action result
 * with no message stays one.
 */
export function withoutDashes(text, joiner = ': ') {
  if (typeof text !== 'string') return text;
  return text.replace(/\s*\u2014\s*/g, joiner);
}

/** 500 -> "500 L" */
export function formatLitres(value) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return '0 L';
  return `${numberFormat.format(n)} L`;
}

export function formatNumber(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? numberFormat.format(n) : '0';
}


// ---------------------------------------------------------------------------
// Money
//
// Here rather than in helpers.js because the client needs it: the statement
// preview shows the reader the same figures the PDF will print, and the two must
// format identically. helpers.js re-exports both, so server callers are
// unaffected.
// ---------------------------------------------------------------------------

const moneyFormat = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/**
 * Whole rupees, for anything a person actually hands over or owes.
 *
 * The distinction against roundMoney matters and is not cosmetic:
 *
 *   roundMoney (2 dp)  - the arithmetic of the meter. litres x rate genuinely
 *                        carries paisa, and a day's sale_amount must keep them
 *                        or the takings stop reconciling against stock.
 *   roundRupees        - the customer ledger. A debt is settled with notes, and
 *                        the smallest note or coin is one rupee, so a balance
 *                        that cannot be paid in cash should never be created.
 *
 * Where a whole-rupee credit is taken out of a fractional sale, the CASH side
 * absorbs the remainder - which is right, because cash is the residual and is
 * counted in notes anyway.
 */
export function roundRupees(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;

  /*
   * Half away from zero, because that is what Postgres `round()` does and what
   * Intl does when it formats. JavaScript's own Math.round rounds half toward
   * +Infinity, so Math.round(-0.5) is -0 while Postgres gives -1 - and the two
   * ends of the app would then disagree about whether an account was settled.
   * Anything that rounds a balance has to round it the same way.
   */
  const sign = n < 0 ? -1 : 1;
  return sign * Math.round(Math.abs(n) + Number.EPSILON);
}

/**
 * 140000 -> "Rs 140,000"
 *
 * The `|| 0` is not decoration. Intl rounds -0.28 to the string "-0", so a
 * customer sitting on a 28-paisa residue on the wrong side of zero had an
 * OWES column reading "Rs -0" - which looks like a bug to anyone who sees it,
 * and is one. Collapsing to zero before formatting is what stops it.
 */
export function formatPKR(value) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 'Rs 0';
  return `Rs ${moneyFormat.format(roundRupees(n) === 0 ? 0 : n)}`;
}
