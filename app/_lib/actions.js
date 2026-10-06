'use server';

/**
 * Every mutation in the app.
 *
 * House rules:
 *   - the FIRST line of every action is requireRole(...), no exceptions
 *   - actions return { ok, message } so forms can show the result with
 *     useActionState, rather than throwing at the user
 *   - money and litres are recomputed here from the raw inputs; whatever the
 *     browser posted for a total is treated as a hint, never as fact
 *   - the database has the final say - if a constraint refuses a write, its
 *     message is passed straight through, because those messages are the ones
 *     that actually explain what is wrong
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createClient } from './supabase-server';
import { createAdminClient, createPasswordCheckClient } from './supabase-auth';
import {
  requireRole,
  ROLES,
  roundMoney,
  roundRupees,
  landingPageFor,
  fullResetAllowed,
  formatLitres,
  formatLitresFine,
  saleAmount as exactSaleAmount,
  formatPKR,
  formatRate,
  shiftISODate,
  formatDate,
  todayISO,
} from './helpers';
import { withoutDashes } from './format-helpers';
import { ASSET_CATEGORIES } from './asset-categories';
import { TREASURY_IN_CATEGORIES, TREASURY_OUT_CATEGORIES } from './treasury-categories';

// ---------------------------------------------------------------------------
// Small input helpers
// ---------------------------------------------------------------------------

// Every result a form shows passes through here, including refusals raised by
// Postgres and passed on word for word - so this is where a database sentence
// loses its em dash (see withoutDashes).
const ok = (message) => ({ ok: true, message: withoutDashes(message) });
const fail = (message) => ({ ok: false, message: withoutDashes(message) });

function text(formData, field) {
  const value = formData.get(field);
  return typeof value === 'string' ? value.trim() : '';
}

function number(formData, field) {
  const raw = text(formData, field);
  if (raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Turns a database error into something worth reading.
 *
 * The check constraints and triggers were written with human-readable messages
 * precisely so they could be shown here rather than swallowed.
 */
function describe(error, fallback) {
  if (!error) return fallback;
  const message = error.message ?? String(error);

  if (message.includes('nozzle_readings_split_matches_sale')) {
    return 'Cash plus credit does not equal the amount sold. Check the figures and try again.';
  }
  if (message.includes('nozzle_readings_closing_gte_opening')) {
    return 'The closing reading is lower than the opening reading. A meter cannot run backwards.';
  }
  if (message.includes('nozzle_readings_nozzle_id_reading_date_shift_key')) {
    return 'This nozzle has already been entered for that date.';
  }
  if (message.includes('stock_checks_tank_id_check_date_key')) {
    return 'A stock check for that tank and date has already been recorded.';
  }
  if (message.includes('suppliers_name_unique')) {
    return 'A supplier with that name is already on the list. Use a different name, or edit the one that is there.';
  }
  if (message.includes('fuel_prices_fuel_type_effective_from_key')) {
    return 'A rate for that fuel and date already exists. Pick a different date to change it.';
  }
  if (message.includes('append-only')) {
    return 'The ledger cannot be edited. Post a new offsetting entry instead.';
  }
  if (message.includes('lubricants_active_name_unique')) {
    return 'A lubricant with that name is already on the list. Use a different name, or edit the one that is there.';
  }
  if (message.includes('lubricant_sales_split_matches_amount')) {
    return 'Cash plus credit does not equal the amount of the sale. Check the figures and try again.';
  }
  if (message.includes('lubricant_sales_credit_needs_customer')) {
    return 'Choose the customer this was given to on credit.';
  }
  // The treasury's two constraint names. Its balance rule raises its own
  // sentence and needs no entry here - only these two surface as raw Postgres
  // text, because a unique index and a check constraint have no voice of
  // their own.
  if (message.includes('treasury_entries_one_opening')) {
    return 'The safe already has an opening amount recorded, and it can only have one. If this is cash arriving, record it as an Entry instead.';
  }
  if (message.includes('treasury_entries_category_fits_direction')) {
    return 'That reason does not belong to that direction: money in and money out have their own lists. Pick the direction first, then the reason.';
  }
  return message || fallback;
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

export async function signIn(_prevState, formData) {
  const email = text(formData, 'email');
  const password = String(formData.get('password') ?? '');
  const next = text(formData, 'next');

  if (!email || !password) {
    return fail('Enter your email and password.');
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Bad email or password. Deliberately vague - never reveal whether an
    // account with that email exists.
    if (error.status === 400 || error.code === 'invalid_credentials') {
      return fail('Those details did not work. Check your email and password.');
    }

    // Anything else means the server could not be reached or is unwell. Saying
    // "check your password" here would send someone hunting for a typo that
    // isn't there.
    return fail(
      'Could not reach the server just now. Check the internet connection and try again.',
    );
  }

  const { data: claims } = await supabase.auth.getClaims();
  let destination = next && next.startsWith('/admin') ? next : null;

  if (!destination) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_active')
      .eq('id', claims?.claims?.sub)
      .single();

    if (!profile?.is_active) {
      await supabase.auth.signOut();
      return fail('This account has been deactivated. Ask the owner to re-enable it.');
    }

    destination = landingPageFor(profile.role);
  }

  // redirect() throws internally, so it has to sit outside any try/catch.
  redirect(destination);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/admin/login');
}

/**
 * Changes your OWN password. Both roles - this is not account management.
 *
 * The owner hands out a password when he creates a login, so everyone needs a
 * way to replace it with something only they know. Nobody can change anyone
 * else's here: the new password is applied to whoever is signed in, taken from
 * the session, never from the form.
 *
 * The current password is checked first, on purpose. Supabase does not require
 * it, but without that check anyone who found an unlocked phone with the app
 * still open could lock the owner out of his own books in two taps.
 */
export async function changePassword(_prevState, formData) {
  let profile;
  try {
    profile = await requireRole(ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY);
  } catch (error) {
    return fail(error.message);
  }

  const currentPassword = String(formData.get('current_password') ?? '');
  const newPassword = String(formData.get('new_password') ?? '');
  const confirmPassword = String(formData.get('confirm_password') ?? '');

  if (!currentPassword || !newPassword) {
    return fail('Fill in your current password and the new one.');
  }
  if (newPassword.length < 8) {
    return fail('The new password must be at least 8 characters.');
  }
  if (newPassword !== confirmPassword) {
    return fail('The two new passwords do not match.');
  }
  if (newPassword === currentPassword) {
    return fail('The new password is the same as the current one.');
  }
  if (!profile.email) {
    return fail('Could not read your email address. Sign out and in again, then retry.');
  }

  // Check the current password on a throwaway client so this cannot disturb
  // the session that is running the form.
  const checkClient = createPasswordCheckClient();
  const { error: checkError } = await checkClient.auth.signInWithPassword({
    email: profile.email,
    password: currentPassword,
  });

  if (checkError) {
    if (checkError.status === 400 || checkError.code === 'invalid_credentials') {
      return fail('Your current password is not right.');
    }
    return fail('Could not reach the server just now. Try again in a moment.');
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: newPassword });

  if (error) {
    // Supabase enforces its own rules too (length, leaked-password checks).
    return fail(describe(error, 'Could not change the password.'));
  }

  return ok('Password changed. Use the new one next time you sign in.');
}

// ---------------------------------------------------------------------------
// Daily nozzle readings - the core daily habit
// ---------------------------------------------------------------------------

/**
 * Saves one nozzle's day, together with its credit slips, in one transaction.
 *
 * The cash figure is derived here (total sold minus the slips) rather than
 * taken from the form, so cash can never be quietly wrong.
 */
export async function saveReading(_prevState, formData) {
  try {
    await requireRole(ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY);
  } catch (error) {
    return fail(error.message);
  }

  const nozzleId = text(formData, 'nozzle_id');
  const readingDate = text(formData, 'reading_date');
  const opening = number(formData, 'opening_reading');
  const closing = number(formData, 'closing_reading');
  const rate = number(formData, 'rate_per_litre');

  if (!nozzleId || !readingDate) return fail('Missing the nozzle or the date.');
  if (opening === null) return fail('Enter the opening reading.');
  if (closing === null) return fail('Enter the closing reading.');
  if (rate === null || rate <= 0) {
    return fail('No rate is set for this fuel. Ask the owner to set today’s price first.');
  }
  if (closing < opening) {
    return fail('The closing reading is lower than the opening reading.');
  }

  // Credit slips arrive as JSON from the form component.
  let creditLines = [];
  const rawLines = text(formData, 'credit_lines');
  if (rawLines) {
    try {
      creditLines = JSON.parse(rawLines);
    } catch {
      return fail('The credit slips could not be read. Please re-enter them.');
    }
  }

  if (!Array.isArray(creditLines)) creditLines = [];

  const cleanedLines = [];
  for (const line of creditLines) {
    const customerId = String(line?.customer_id ?? '').trim();
    const litres = Number(line?.litres);
    const amount = Number(line?.amount);

    if (!customerId) return fail('Every credit slip needs a customer.');
    if (!Number.isFinite(litres) || litres <= 0) {
      return fail('Every credit slip needs a litres figure above zero.');
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return fail('Every credit slip needs an amount above zero.');
    }

    /*
     * WHOLE RUPEES ON THE SLIP, two decimals on the litres.
     *
     * The slip becomes a debit on the customer's ledger, and a debt is settled
     * with notes - the smallest of which is one rupee. Left at two decimals,
     * 11 litres at Rs 339.48 posted Rs 3,734.28, the customer paid the Rs 3,734
     * he was asked for, and 28 paisa sat on his account for ever because no
     * payment can clear it. See roundRupees in helpers.js.
     *
     * The sale itself keeps its paisa; the CASH side absorbs the difference,
     * which is where it belongs, cash being the residual and counted in notes.
     */
    cleanedLines.push({
      customer_id: customerId,
      litres: roundMoney(litres),
      amount: roundRupees(amount),
    });
  }

  const litresSold = roundMoney(closing - opening);

  /*
   * EXACT, not `roundMoney(litresSold * rate)`. That was a floating-point
   * multiplication of the same figures Postgres multiplies in `numeric`, and on
   * a half-paisa the two disagreed by a paisa - which the balanced-day
   * constraint refused, on a reading where every figure was correct. See
   * migration 052 and saleAmount() in format-helpers.js.
   *
   * The database no longer believes this number anyway: create_nozzle_reading
   * derives the cash itself. It is still computed here for the guard below and
   * for the message, and it has to be the same figure the database will reach
   * or the sentence would quote a total the books disagree with.
   */
  const saleAmount = exactSaleAmount(litresSold, rate);
  const creditTotal = roundMoney(cleanedLines.reduce((total, line) => total + line.amount, 0));
  const cashAmount = roundMoney(saleAmount - creditTotal);

  if (cashAmount < 0) {
    return fail(
      `The credit slips come to Rs ${creditTotal.toLocaleString()}, which is more than the ` +
        `Rs ${saleAmount.toLocaleString()} sold on this nozzle. Check the slips.`,
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('create_nozzle_reading', {
    p_nozzle_id: nozzleId,
    p_reading_date: readingDate,
    p_opening: opening,
    p_closing: closing,
    p_rate: rate,
    p_cash: cashAmount,
    p_credit_lines: cleanedLines,
  });

  if (error) return fail(describe(error, 'Could not save the reading.'));

  revalidatePath('/admin/readings');
  revalidatePath('/admin');
  revalidatePath('/admin/customers');

  return ok(
    cleanedLines.length > 0
      ? `Saved. ${litresSold} L sold, with ${cleanedLines.length} credit slip${
          cleanedLines.length === 1 ? '' : 's'
        } posted to the ledger.`
      : `Saved. ${litresSold} L sold, all cash.`,
  );
}

/**
 * Removing a reading is a super_admin-only correction. It will be refused if
 * its credit slips have already reached the ledger - that debt has to be
 * cancelled with an offsetting entry first, so the history stays intact.
 */
export async function deleteReading(_prevState, formData) {
  try {
    await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const readingId = text(formData, 'reading_id');
  if (!readingId) return fail('Missing the reading.');

  // Goes through delete_reading() rather than deleting the row directly. That
  // function posts an offsetting ledger entry for every credit slip it takes
  // away, in the same transaction. Deleting the row straight would remove the
  // slip but leave the customer's debit standing, so they would appear to owe
  // money for fuel the books no longer show them taking.
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('delete_reading', { p_reading_id: readingId });

  if (error) return fail(describe(error, 'Could not delete the reading.'));

  revalidatePath('/admin/readings');
  revalidatePath('/admin');
  revalidatePath('/admin/customers');

  const reversed = Number(data?.slips_reversed ?? 0);
  return ok(
    reversed > 0
      ? `Reading deleted. ${reversed} credit ${reversed === 1 ? 'slip' : 'slips'} reversed on the customer ledger.`
      : 'Reading deleted.',
  );
}

/**
 * Wipes one day's nozzle entries so the day can be entered again.
 *
 * The mistake this fixes is ordinary: a day entered against the wrong date, or
 * six nozzles typed in before anyone noticed the figures were yesterday's. Left
 * alone it poisons everything downstream, because each day's opening comes from
 * the day before.
 *
 * Scope is deliberately just the nozzle entries and their credit slips. Fuel
 * deliveries, stock checks and expenses are deleted one at a time on their own
 * screens, where you can see what you are removing.
 *
 * Credit slips are reversed, not erased - clear_day posts an offsetting entry
 * for each one, so a customer's balance comes back to correct while the history
 * of what happened stays readable.
 */
export async function clearDay(_prevState, formData) {
  try {
    await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const date = text(formData, 'date');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail('Missing the date.');

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('clear_day', { p_date: date });

  if (error) return fail(describe(error, 'Could not clear the day.'));

  revalidatePath('/admin/readings');
  revalidatePath('/admin');
  revalidatePath('/admin/customers');
  revalidatePath('/admin/reports');

  const cleared = Number(data?.readings ?? 0);
  const reversed = Number(data?.slips_reversed ?? 0);

  if (cleared === 0) return ok('There was nothing entered for that day.');

  return ok(
    reversed > 0
      ? `Cleared ${cleared} nozzle ${cleared === 1 ? 'entry' : 'entries'}, and reversed ${reversed} credit ${reversed === 1 ? 'slip' : 'slips'} on the customer ledger.`
      : `Cleared ${cleared} nozzle ${cleared === 1 ? 'entry' : 'entries'}. Enter the day again when ready.`,
  );
}

/**
 * Empties the books completely. Testing scaffolding, not a feature.
 *
 * Three separate things have to be true for this to run: ALLOW_FULL_RESET must
 * be set on the server, the caller must be the owner, and they must type their
 * own password and the word RESET. The environment variable is the important
 * one - deleting it in Vercel retires this permanently without touching code,
 * which is how it is meant to end.
 */
export async function resetEverything(_prevState, formData) {
  if (!fullResetAllowed()) {
    return fail('Resetting everything is switched off on this deployment.');
  }

  let profile;
  try {
    profile = await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const password = String(formData.get('owner_password') ?? '');
  const confirmation = text(formData, 'confirmation');

  if (confirmation !== 'RESET') return fail('Type RESET in capitals to confirm.');
  if (!password) return fail('Enter your own password to confirm.');
  if (!profile.email) return fail('Could not read your email address. Sign in again and retry.');

  const checkClient = createPasswordCheckClient();
  const { error: checkError } = await checkClient.auth.signInWithPassword({
    email: profile.email,
    password,
  });

  if (checkError) {
    if (checkError.status === 400 || checkError.code === 'invalid_credentials') {
      return fail('That is not your password. Nothing has been deleted.');
    }
    return fail('Could not reach the server just now. Nothing has been deleted.');
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('reset_all_data');

  if (error) return fail(describe(error, 'Could not reset the data.'));

  [
    '/admin',
    '/admin/readings',
    '/admin/purchases',
    '/admin/stock-checks',
    '/admin/customers',
    '/admin/lubricants',
    '/admin/expenses',
    '/admin/reports',
    '/admin/settings',
  ].forEach(revalidatePath);

  const n = (key) => Number(data?.[key] ?? 0);
  return ok(
    `Everything cleared: ${n('readings')} readings, ${n('customers')} customers, ` +
      `${n('purchases')} deliveries, ${n('lubricant_sales')} lubricant sales, ` +
      `${n('expenses')} expenses. Logins, tanks, nozzle starting readings and the ` +
      'lubricant product list were kept.',
  );
}

// ---------------------------------------------------------------------------
// Fuel purchases
// ---------------------------------------------------------------------------

export async function createPurchase(_prevState, formData) {
  let profile;
  try {
    profile = await requireRole(ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY);
  } catch (error) {
    return fail(error.message);
  }

  const tankId = text(formData, 'tank_id');
  const purchaseDate = text(formData, 'purchase_date');
  const quantity = number(formData, 'quantity_litres');
  const totalCost = number(formData, 'total_cost');
  const supplierId = text(formData, 'supplier_id');
  const invoiceNumber = text(formData, 'invoice_number');
  const paymentStatus = text(formData, 'payment_status') || 'pending';

  if (!tankId) return fail('Choose which tank the fuel went into.');
  if (!purchaseDate) return fail('Enter the delivery date.');
  if (quantity === null || quantity <= 0) return fail('Enter how many litres were delivered.');
  if (totalCost === null || totalCost <= 0) return fail('Enter the amount on the delivery note.');
  if (!supplierId) return fail('Choose the supplier this delivery came from.');
  if (!['paid', 'pending'].includes(paymentStatus)) return fail('Invalid payment status.');

  const supabase = await createClient();
  // The name is still stored on the delivery (the Purchases table and every
  // report read it), taken from the supplier's own row so the two agree.
  const supplierName = await supplierNameFor(supabase, supplierId);
  if (!supplierName) return fail('That supplier is no longer on the list. Reload the page.');

  const { error } = await supabase.from('fuel_purchases').insert({
    tank_id: tankId,
    purchase_date: purchaseDate,
    quantity_litres: quantity,
    // The amount on the note is what gets stored; the rate per litre is a
    // generated column derived from it - see migration 023.
    total_cost: roundMoney(totalCost),
    supplier_name: supplierName,
    // Posts the delivery to the supplier's account by trigger (067).
    supplier_id: supplierId,
    invoice_number: invoiceNumber || null,
    payment_status: paymentStatus,
    created_by: profile.id,
  });

  if (error) return fail(describe(error, 'Could not save the purchase.'));

  revalidatePath('/admin/purchases');
  revalidatePath('/admin');
  revalidatePath('/admin/stock-checks');
  revalidatePath('/admin/suppliers');

  return ok(`Saved. ${quantity} L added to stock, and ${supplierName}'s account updated.`);
}

/*
 * Fuel and lubricant purchases sit in one list on screen, so the two actions
 * below serve both. `kind` says which table the row came from; anything other
 * than 'lubricant' is treated as fuel, so an old form that never sent the field
 * keeps working.
 */
const PURCHASE_TABLES = {
  fuel: { table: 'fuel_purchases', noun: 'delivery' },
  lubricant: { table: 'lubricant_purchases', noun: 'lubricant purchase' },
};

const purchaseTable = (formData) => PURCHASE_TABLES[text(formData, 'kind')] ?? PURCHASE_TABLES.fuel;

/**
 * Removes a purchase. Owner only, and the way to correct a mistyped quantity -
 * delete the wrong one and record it again, rather than leaving stock carrying
 * something that never arrived. Stock is recalculated by trigger either way.
 */
export async function deletePurchase(_prevState, formData) {
  try {
    await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const purchaseId = text(formData, 'purchase_id');
  const { table, noun } = purchaseTable(formData);
  if (!purchaseId) return fail(`Missing the ${noun}.`);

  const supabase = await createClient();
  const { error } = await supabase.from(table).delete().eq('id', purchaseId);

  if (error) return fail(describe(error, `Could not delete the ${noun}.`));

  revalidatePath('/admin/purchases');
  revalidatePath('/admin');
  revalidatePath('/admin/stock-checks');
  revalidatePath('/admin/lubricants');
  revalidatePath('/admin/suppliers', 'layout');
  return ok(
    noun === 'delivery'
      ? 'Delivery deleted. Tank stock has been recalculated.'
      : 'Purchase deleted. Lubricant stock has been recalculated.',
  );
}

export async function setPurchasePaymentStatus(_prevState, formData) {
  try {
    await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const purchaseId = text(formData, 'purchase_id');
  const paymentStatus = text(formData, 'payment_status');
  const { table } = purchaseTable(formData);

  if (!purchaseId) return fail('Missing the purchase.');
  if (!['paid', 'pending'].includes(paymentStatus)) return fail('Invalid payment status.');

  const supabase = await createClient();
  const { error } = await supabase
    .from(table)
    .update({ payment_status: paymentStatus })
    .eq('id', purchaseId);

  if (error) return fail(describe(error, 'Could not update the purchase.'));

  revalidatePath('/admin/purchases');
  return ok(paymentStatus === 'paid' ? 'Marked as paid.' : 'Marked as pending.');
}

// ---------------------------------------------------------------------------
// Lubricants
//
// Three things live here: the product list, stock coming in from the
// distributor, and sales over the counter.
//
// Who may do what follows the same line as everywhere else. Recording a sale or
// a delivery is daily work, so staff do both. The product list is
// configuration - which brands are stocked, what they are priced at, what was
// on the shelf to begin with - so it belongs to the owner, like the tanks.
// ---------------------------------------------------------------------------

/**
 * Litres, rounded the way Postgres rounds them - three decimals, matching
 * lubricant_sales.litres since migration 028. The third decimal is there for
 * loose oil: Rs 20 out of a drum at Rs 580 a litre is 0.0345 L, and at two
 * decimals that becomes 0.03 - a tenth of the sale lost, every time.
 */
const roundLitres = (value) => Math.round((value + Number.EPSILON) * 1000) / 1000;

export async function createLubricant(_prevState, formData) {
  let profile;
  try {
    profile = await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const name = text(formData, 'name');
  const packSize = number(formData, 'pack_size_litres');
  const saleRate = number(formData, 'sale_rate_per_litre');
  const openingStock = number(formData, 'opening_stock_litres');
  const openingDate = text(formData, 'opening_stock_date');
  const soldLoose = text(formData, 'sold_loose') === 'true';

  if (!name) return fail('Enter the lubricant’s name.');
  if (packSize === null || packSize <= 0) return fail('Enter the pack size in litres.');
  if (saleRate !== null && saleRate <= 0) return fail('The selling rate must be above zero.');
  if (openingStock !== null && openingStock < 0) {
    return fail('The opening stock cannot be negative.');
  }
  if (!openingDate) return fail('Enter the date the opening stock counts from.');
  // The rate is the only thing turning rupees into litres off a drum, so a
  // loose product without one could take money and no stock. The database
  // refuses this too (lubricants_loose_needs_rate); this is the friendlier of
  // the two messages.
  if (soldLoose && (saleRate === null || saleRate <= 0)) {
    return fail(
      'Loose oil needs a selling rate per litre: it is what turns “Rs 20 of oil” ' +
        'into litres off the drum.',
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.from('lubricants').insert({
    name,
    pack_size_litres: packSize,
    sale_rate_per_litre: saleRate,
    opening_stock_litres: openingStock ?? 0,
    opening_stock_date: openingDate,
    sold_loose: soldLoose,
    created_by: profile.id,
  });

  if (error) return fail(describe(error, 'Could not add the lubricant.'));

  revalidatePath('/admin/lubricants');
  revalidatePath('/admin/stock-checks');
  revalidatePath('/admin/purchases');
  return ok(`${name} added. It can be sold and restocked from now on.`);
}

export async function updateLubricant(_prevState, formData) {
  try {
    await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const lubricantId = text(formData, 'lubricant_id');
  const name = text(formData, 'name');
  const packSize = number(formData, 'pack_size_litres');
  const saleRate = number(formData, 'sale_rate_per_litre');
  const openingStock = number(formData, 'opening_stock_litres');
  const openingDate = text(formData, 'opening_stock_date');
  const soldLoose = text(formData, 'sold_loose') === 'true';

  if (!lubricantId) return fail('Missing the lubricant.');
  if (!name) return fail('Enter the lubricant’s name.');
  if (packSize === null || packSize <= 0) return fail('Enter the pack size in litres.');
  if (saleRate !== null && saleRate <= 0) return fail('The selling rate must be above zero.');
  if (openingStock === null || openingStock < 0) return fail('Enter the opening stock.');
  if (!openingDate) return fail('Enter the date the opening stock counts from.');
  if (soldLoose && (saleRate === null || saleRate <= 0)) {
    return fail(
      'Loose oil needs a selling rate per litre: it is what turns “Rs 20 of oil” ' +
        'into litres off the drum.',
    );
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('lubricants')
    .update({
      name,
      pack_size_litres: packSize,
      sale_rate_per_litre: saleRate,
      opening_stock_litres: openingStock,
      opening_stock_date: openingDate,
      sold_loose: soldLoose,
    })
    .eq('id', lubricantId);

  if (error) return fail(describe(error, 'Could not update the lubricant.'));

  revalidatePath('/admin/lubricants');
  revalidatePath('/admin/stock-checks');
  revalidatePath('/admin');
  return ok(`${name} updated.`);
}

/**
 * Removes a lubricant from the shelf.
 *
 * The database decides which of the two possible meanings applies: a product
 * that was never bought or sold is deleted outright, while one with history is
 * retired so the months it appears in keep adding up. The message says which
 * happened rather than leaving the owner to work it out - see delete_lubricant
 * in migration 024.
 */
export async function deleteLubricant(_prevState, formData) {
  try {
    await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const lubricantId = text(formData, 'lubricant_id');
  if (!lubricantId) return fail('Missing the lubricant.');

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('delete_lubricant', {
    p_lubricant_id: lubricantId,
  });

  if (error) return fail(describe(error, 'Could not remove the lubricant.'));

  revalidatePath('/admin/lubricants');
  revalidatePath('/admin/stock-checks');
  revalidatePath('/admin/purchases');
  revalidatePath('/admin');

  const name = data?.name ?? 'The lubricant';

  if (data?.removed) return ok(`${name} removed. It was never bought or sold.`);

  return ok(
    `${name} retired. It will not appear on the sale form again, and its past ` +
      'sales and purchases stay on the books.',
  );
}

/** Puts a retired product back on the shelf. */
export async function setLubricantActive(_prevState, formData) {
  try {
    await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const lubricantId = text(formData, 'lubricant_id');
  const isActive = text(formData, 'is_active') === 'true';

  if (!lubricantId) return fail('Missing the lubricant.');

  const supabase = await createClient();
  const { error } = await supabase
    .from('lubricants')
    .update({ is_active: isActive })
    .eq('id', lubricantId);

  if (error) return fail(describe(error, 'Could not update the lubricant.'));

  revalidatePath('/admin/lubricants');
  revalidatePath('/admin/stock-checks');
  return ok(isActive ? 'Back on the shelf.' : 'Retired.');
}

/**
 * Stock in from the distributor. Same shape as a fuel delivery, and the same
 * rule about which figure is the fact: the invoice total is typed and the rate
 * per litre is derived from it.
 */
export async function createLubricantPurchase(_prevState, formData) {
  let profile;
  try {
    profile = await requireRole(ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY);
  } catch (error) {
    return fail(error.message);
  }

  const lubricantId = text(formData, 'lubricant_id');
  const purchaseDate = text(formData, 'purchase_date');
  const quantity = number(formData, 'quantity_litres');
  const totalCost = number(formData, 'total_cost');
  const supplierId = text(formData, 'supplier_id');
  const invoiceNumber = text(formData, 'invoice_number');
  const paymentStatus = text(formData, 'payment_status') || 'pending';

  if (!lubricantId) return fail('Choose which lubricant was delivered.');
  if (!purchaseDate) return fail('Enter the delivery date.');
  if (quantity === null || quantity <= 0) return fail('Enter how many litres were delivered.');
  if (totalCost === null || totalCost <= 0) return fail('Enter the amount on the invoice.');
  if (!supplierId) return fail('Choose the supplier this came from.');
  if (!['paid', 'pending'].includes(paymentStatus)) return fail('Invalid payment status.');

  const supabase = await createClient();
  const supplierName = await supplierNameFor(supabase, supplierId);
  if (!supplierName) return fail('That supplier is no longer on the list. Reload the page.');

  const { error } = await supabase.from('lubricant_purchases').insert({
    lubricant_id: lubricantId,
    purchase_date: purchaseDate,
    quantity_litres: roundLitres(quantity),
    total_cost: roundMoney(totalCost),
    supplier_name: supplierName,
    supplier_id: supplierId,
    invoice_number: invoiceNumber || null,
    payment_status: paymentStatus,
    created_by: profile.id,
  });

  if (error) return fail(describe(error, 'Could not save the purchase.'));

  revalidatePath('/admin/purchases');
  revalidatePath('/admin/suppliers');
  revalidatePath('/admin/lubricants');
  revalidatePath('/admin/stock-checks');
  revalidatePath('/admin');

  return ok(`Saved. ${formatLitres(quantity)} added to the shelf.`);
}

/**
 * One sale over the counter.
 *
 * Cash is derived here - amount minus whatever was put on credit - rather than
 * taken from the form, for the same reason it is on the reading screen: cash
 * should never be able to be quietly wrong. A sale with any credit on it must
 * name the customer, and the database refuses it otherwise.
 */
export async function createLubricantSale(_prevState, formData) {
  let profile;
  try {
    profile = await requireRole(ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY);
  } catch (error) {
    return fail(error.message);
  }

  const lubricantId = text(formData, 'lubricant_id');
  const saleDate = text(formData, 'sale_date');
  const amount = number(formData, 'amount');
  const creditAmount = number(formData, 'credit_amount') ?? 0;
  const customerId = text(formData, 'customer_id');
  const note = text(formData, 'note');

  if (!lubricantId) return fail('Choose which lubricant was sold.');
  if (!saleDate) return fail('Missing the date.');
  if (amount === null || amount <= 0) return fail('Enter what the customer was charged.');
  if (creditAmount < 0) return fail('The credit amount cannot be negative.');

  /*
   * Whole rupees, and rounded HERE rather than further down, because the loose
   * litres are worked out from this figure - deriving them from an unrounded
   * amount and then storing the rounded one would put the two slightly out of
   * step. A counter sale is money handed over the counter and the smallest
   * thing anyone can hand over is a rupee, so "Rs 462.50 of oil" is not a real
   * sale and a credit of Rs 462.50 is a debt nobody can pay off. Rounding both
   * sides keeps paisa off the customer ledger through this door as well as
   * through the readings one.
   */
  const total = roundRupees(amount);
  if (total <= 0) return fail('A sale has to be at least one rupee.');

  const supabase = await createClient();
  const { data: product, error: productError } = await supabase
    .from('lubricants')
    .select('name, sold_loose, sale_rate_per_litre')
    .eq('id', lubricantId)
    .single();

  if (productError || !product) {
    return fail(describe(productError, 'Could not find that lubricant.'));
  }

  /*
   * Which number was typed depends on the product.
   *
   * A packed product is sold by the litre - the form asks for litres and the
   * amount is whatever was charged for them. A drum is sold by the rupee, so
   * the litres are ARITHMETIC ON THE RATE and are worked out here rather than
   * accepted from the browser. Deriving them server-side is what stops a
   * hand-edited form recording Rs 500 of oil against a teaspoon of stock, and
   * it means the drum's book level can only ever disagree with the drum
   * because the rate is wrong - which is one explanation to check, not two.
   */
  let litres;

  if (product.sold_loose) {
    const rate = Number(product.sale_rate_per_litre);
    if (!Number.isFinite(rate) || rate <= 0) {
      return fail(
        `${product.name} has no selling rate, so there is no way to tell how much oil ` +
          `Rs ${total} is. Set a rate per litre under “Manage lubricants” first.`,
      );
    }
    litres = roundLitres(total / rate);
    if (litres <= 0) {
      return fail(
        `That is too small to record: at ${formatRate(rate)} a litre it works out at ` +
          'under a millilitre.',
      );
    }
  } else {
    litres = number(formData, 'litres');
    if (litres === null || litres <= 0) return fail('Enter how many litres were sold.');
    litres = roundLitres(litres);
  }

  const credit = roundRupees(creditAmount);

  if (credit > total) {
    return fail('The amount on credit is more than the sale itself. Check the figures.');
  }
  if (credit > 0 && !customerId) {
    return fail('Choose the customer this was given to on credit.');
  }

  const cash = roundMoney(total - credit);

  const { error } = await supabase.from('lubricant_sales').insert({
    lubricant_id: lubricantId,
    sale_date: saleDate,
    litres,
    amount: total,
    cash_amount: cash,
    credit_amount: credit,
    // A cash sale may still name the customer, but only a credit sale needs to.
    customer_id: customerId || null,
    note: note || null,
    created_by: profile.id,
  });

  if (error) return fail(describe(error, 'Could not save the sale.'));

  revalidatePath('/admin/lubricants');
  revalidatePath('/admin/lubricants/loose');
  revalidatePath('/admin/stock-checks');
  revalidatePath('/admin');
  if (credit > 0) revalidatePath('/admin/customers');

  /*
   * The confirmation leads with whichever number the owner actually typed. On
   * a drum that is the money - reading back "0.034 L sold" to someone who
   * typed "20" is an answer to a question nobody asked, and it looks wrong
   * besides.
   */
  const sold = product.sold_loose
    ? `${formatPKR(total)} of ${product.name} (${formatLitresFine(litres)})`
    : formatLitres(litres);

  return ok(
    credit > 0
      ? `Saved. ${sold} sold, ${formatPKR(credit)} of it on credit and posted to the ledger.`
      : `Saved. ${sold} sold for cash.`,
  );
}

/**
 * Removes a sale. Owner only, like deleting a nozzle reading, and for the same
 * reason: the credit on it has already moved a customer's balance. The database
 * posts the offsetting entry before the row goes, so the ledger keeps showing
 * both what happened and what undid it.
 */
export async function deleteLubricantSale(_prevState, formData) {
  try {
    await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const saleId = text(formData, 'sale_id');
  if (!saleId) return fail('Missing the sale.');

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('delete_lubricant_sale', { p_sale_id: saleId });

  if (error) return fail(describe(error, 'Could not delete the sale.'));

  revalidatePath('/admin/lubricants');
  revalidatePath('/admin/stock-checks');
  revalidatePath('/admin/customers');
  revalidatePath('/admin');

  return ok(
    data?.credit_reversed
      ? 'Sale deleted, and the credit on it reversed on the customer’s ledger.'
      : 'Sale deleted. Stock has been recalculated.',
  );
}

// ---------------------------------------------------------------------------
// Stock checks (the physical dip)
// ---------------------------------------------------------------------------

export async function createStockCheck(_prevState, formData) {
  let profile;
  try {
    profile = await requireRole(ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY);
  } catch (error) {
    return fail(error.message);
  }

  const tankId = text(formData, 'tank_id');
  const checkDate = text(formData, 'check_date');
  const taken = text(formData, 'taken') === 'evening' ? 'evening' : 'morning';
  const actualDip = number(formData, 'actual_dip_reading');
  const note = text(formData, 'note');

  if (!tankId) return fail('Choose a tank.');
  if (!checkDate) return fail('Enter the date of the dip.');
  if (actualDip === null || actualDip < 0) return fail('Enter the measured dip reading.');

  /*
   * A dip is a moment, not a day. The pump dips first thing in the morning,
   * before the pumps are switched on, so a dip dated the 11th measures the
   * tank as it stood at the CLOSE OF THE 10TH - and that is the day its
   * gain/loss belongs to. See migration 039; the database generates the same
   * figure into `books_date` and reports on it.
   */
  const closesDate = taken === 'morning' ? shiftISODate(checkDate, -1) : checkDate;

  const supabase = await createClient();

  // Expected stock is worked out by the database, never sent from the browser -
  // otherwise the gain/loss figure could be made to say anything. The database
  // recomputes it from history on the way in as well, so this value is what the
  // message below reports rather than the last word on what gets stored.
  const { data: expected, error: expectedError } = await supabase.rpc('calculate_expected_stock', {
    p_tank_id: tankId,
    p_date: closesDate,
  });

  if (expectedError) {
    return fail(describe(expectedError, 'Could not work out the expected stock.'));
  }

  const { error } = await supabase.from('stock_checks').insert({
    tank_id: tankId,
    check_date: checkDate,
    taken,
    expected_stock: expected ?? 0,
    actual_dip_reading: actualDip,
    note: note || null,
    created_by: profile.id,
  });

  if (error) return fail(describe(error, 'Could not save the stock check.'));

  const difference = roundMoney(actualDip - Number(expected ?? 0));
  revalidatePath('/admin/stock-checks');
  revalidatePath('/admin');

  const closes = `Checked against ${formatDate(closesDate)}.`;
  if (difference === 0) return ok(`Saved. Stock matches the books exactly. ${closes}`);
  return ok(
    difference > 0
      ? `Saved. Gain of ${difference} L against the books. ${closes}`
      : `Saved. Loss of ${Math.abs(difference)} L against the books. ${closes}`,
  );
}

/**
 * Removes a dip. Owner only, and the way a mistyped rod reading gets corrected:
 * clear it and record it again, the same shape as deleting a purchase or
 * clearing a day on Readings.
 *
 * There is no edit. A dip is two figures and a note, so re-entering it is no
 * slower than editing it - and it keeps one code path for "what a dip is worth"
 * rather than two that could drift apart. Everything downstream is recalculated
 * from history by trigger, so the dips AFTER this one re-base themselves onto
 * whatever is left behind it.
 */
export async function deleteStockCheck(_prevState, formData) {
  try {
    await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const checkId = text(formData, 'check_id');
  if (!checkId) return fail('Missing the dip.');

  const supabase = await createClient();
  const { error } = await supabase.from('stock_checks').delete().eq('id', checkId);

  if (error) return fail(describe(error, 'Could not clear the dip.'));

  revalidatePath('/admin/stock-checks');
  revalidatePath('/admin');
  return ok('Dip cleared. Record the corrected reading now.');
}

// ---------------------------------------------------------------------------
// Customers and the ledger
// ---------------------------------------------------------------------------

export async function createCustomer(_prevState, formData) {
  try {
    await requireRole(ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY);
  } catch (error) {
    return fail(error.message);
  }

  const name = text(formData, 'name');
  const vehicleNumber = text(formData, 'vehicle_number');
  const phone = text(formData, 'phone');
  const creditLimit = number(formData, 'credit_limit');

  /*
   * Most names typed into this app are not new customers - they came out of a
   * paper register, and some already owe money while a few have paid ahead.
   * The opening balance is asked for HERE rather than left as a second trip to
   * the customer's own page, because the second trip is the one that gets
   * forgotten - and an account silently starting at zero when the man owes
   * Rs 40,000 is money leaving the books quietly.
   *
   * The amount is always positive and the direction says which way it goes. A
   * signed figure would allow "-500" and "they owe us" to disagree, with
   * nothing to settle the argument.
   */
  const openingDirection = text(formData, 'opening_direction');
  const openingAmount = number(formData, 'opening_amount');

  if (!name) return fail('Enter the customer’s name.');
  if (creditLimit !== null && creditLimit < 0) return fail('The credit limit cannot be negative.');
  if (openingAmount !== null && openingAmount < 0) {
    return fail('Enter the opening balance as a positive figure and pick which way it goes.');
  }

  const opening = openingDirection ? roundRupees(openingAmount ?? 0) : 0;
  if (opening > 0 && !['owes', 'in_credit'].includes(openingDirection)) {
    return fail('Say whether the customer owes this amount or has paid ahead.');
  }

  const supabase = await createClient();

  // One transaction for the customer and their opening entry - see migration
  // 034. Two separate inserts could leave the customer created and the balance
  // missing, which is the silent zero this is meant to prevent.
  const { data: newId, error } = await supabase.rpc('create_customer_with_opening', {
    p_name: name,
    p_vehicle_number: vehicleNumber || null,
    p_phone: phone || null,
    p_credit_limit: creditLimit,
    p_opening_amount: opening,
    p_opening_direction: opening > 0 ? openingDirection : null,
  });

  if (error) return fail(describe(error, 'Could not create the customer.'));

  revalidatePath('/admin/customers');

  /*
   * Returns rather than redirects. This form lives in a dialog on the customer
   * list now, so the useful ending is the dialog closing over a list that
   * already has the new name on it - not being thrown onto a detail page that
   * shows nothing except what was typed a second ago.
   *
   * The opening balance is repeated back because it is the one figure here
   * that came from a choice rather than a text box, and this is the last
   * chance to notice it went the wrong way before it is on the ledger for good.
   */
  if (opening > 0) {
    return ok(
      openingDirection === 'owes'
        ? `${name} added, owing ${formatPKR(opening)}.`
        : `${name} added, with ${formatPKR(opening)} paid ahead.`,
    );
  }

  return ok(`${name} added.`);
}

/**
 * Correcting a customer's details - a misspelled name, a new phone number, a
 * different vehicle, a raised credit limit.
 *
 * DETAILS ONLY. Nothing here can touch the balance: that lives in the ledger,
 * which is append-only, and is moved with a payment or an adjustment. Keeping
 * the two apart is what makes this safe to hand to staff - the worst outcome
 * of a mistake here is a wrong spelling, not a wrong figure.
 *
 * Same roles as creating one. Someone who can add a customer with a typo
 * should be able to fix the typo.
 */
export async function updateCustomer(_prevState, formData) {
  try {
    await requireRole(ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY);
  } catch (error) {
    return fail(error.message);
  }

  const customerId = text(formData, 'customer_id');
  const name = text(formData, 'name');
  const vehicleNumber = text(formData, 'vehicle_number');
  const phone = text(formData, 'phone');
  const creditLimit = number(formData, 'credit_limit');

  if (!customerId) return fail('Missing the customer.');
  if (!name) return fail('Enter the customer’s name.');
  if (creditLimit !== null && creditLimit < 0) return fail('The credit limit cannot be negative.');

  const supabase = await createClient();
  const { error } = await supabase
    .from('customers')
    .update({
      name,
      vehicle_number: vehicleNumber || null,
      phone: phone || null,
      credit_limit: creditLimit,
    })
    .eq('id', customerId);

  if (error) return fail(describe(error, 'Could not update the customer.'));

  revalidatePath(`/admin/customers/${customerId}`);
  revalidatePath('/admin/customers');
  return ok('Details updated.');
}

/**
 * Takes a customer off the list - a name typed wrong, a duplicate, or an
 * account that has genuinely finished.
 *
 * Owner only, and the database decides which of the two possible meanings
 * applies: an account that never traded is deleted outright, one with history
 * is retired so the months it appears in keep adding up. It refuses either way
 * while the balance is not zero, because a retired customer drops out of
 * "total outstanding" and a debt must not vanish quietly. The message says
 * which happened, and names the figure when it refuses - see delete_customer
 * in migration 031.
 */
export async function deleteCustomer(_prevState, formData) {
  try {
    await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const customerId = text(formData, 'customer_id');
  if (!customerId) return fail('Missing the customer.');

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('delete_customer', {
    p_customer_id: customerId,
  });

  if (error) return fail(describe(error, 'Could not remove the customer.'));

  revalidatePath('/admin/customers');
  revalidatePath('/admin');

  const name = data?.name ?? 'The customer';

  if (data?.removed) {
    return ok(`${name} removed. They had never taken anything on credit.`);
  }

  return ok(
    `${name} removed from the list. Their past credit and payments stay on the ` +
      'books, and they can be brought back at any time.',
  );
}

/**
 * Deletes a customer for good - the row and their ledger entries with it.
 *
 * The step beyond Remove, for a name added by mistake that picked up entries
 * and would otherwise sit in the Removed list for ever looking like a real
 * customer who left.
 *
 * The database decides whether it is allowed, and the line is narrow on
 * purpose: only an account whose whole footprint is entries the owner typed
 * himself. A credit slip belongs to a nozzle reading and a day already
 * reported, so a customer who genuinely traded can only ever be retired - the
 * refusal says so and points at clearing the day instead. See purge_customer
 * in migration 033.
 *
 * The typed name is checked in the database rather than only in the browser,
 * because it is the last thing standing between a mis-aimed click and money
 * records that do not come back.
 */
export async function purgeCustomer(_prevState, formData) {
  try {
    await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const customerId = text(formData, 'customer_id');
  const confirmName = text(formData, 'confirm_name');

  if (!customerId) return fail('Missing the customer.');
  if (!confirmName) return fail('Type the customer\u2019s name to confirm.');

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('purge_customer', {
    p_customer_id: customerId,
    p_confirm_name: confirmName,
  });

  if (error) return fail(describe(error, 'Could not delete the customer.'));

  revalidatePath('/admin/customers');
  revalidatePath('/admin');

  const name = data?.name ?? 'The customer';
  const gone = Number(data?.entries_deleted ?? 0);

  return ok(
    gone > 0
      ? `${name} deleted for good, along with ${gone} ledger ${gone === 1 ? 'entry' : 'entries'}.`
      : `${name} deleted for good.`,
  );
}

/** Puts a removed customer back on the list. */
export async function setCustomerActive(_prevState, formData) {
  try {
    await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const customerId = text(formData, 'customer_id');
  const isActive = text(formData, 'is_active') === 'true';

  if (!customerId) return fail('Missing the customer.');

  const supabase = await createClient();
  const { error } = await supabase
    .from('customers')
    .update({ is_active: isActive })
    .eq('id', customerId);

  if (error) return fail(describe(error, 'Could not update the customer.'));

  revalidatePath('/admin/customers');
  revalidatePath('/admin');
  return ok(isActive ? 'Back on the customer list.' : 'Removed from the list.');
}

/**
 * Records a payment from a customer, reducing what they owe.
 *
 * This is an ordinary append to the ledger. Fuel taken on credit gets there by
 * itself, from the reading screen - it is never typed in here.
 */
export async function recordPayment(_prevState, formData) {
  let profile;
  try {
    profile = await requireRole(ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY);
  } catch (error) {
    return fail(error.message);
  }

  const customerId = text(formData, 'customer_id');
  const amount = number(formData, 'amount');
  const entryDate = text(formData, 'entry_date');
  const note = text(formData, 'note');

  if (!customerId) return fail('Missing the customer.');
  if (amount === null || amount <= 0) return fail('Enter how much they paid.');
  if (!entryDate) return fail('Enter the date of the payment.');

  // Whole rupees: this is cash over the counter, and there is nothing smaller
  // to hand over.
  const paid = roundRupees(amount);
  if (paid <= 0) return fail('A payment has to be at least one rupee.');

  const supabase = await createClient();
  const { error } = await supabase.from('ledger_entries').insert({
    customer_id: customerId,
    entry_type: 'credit',
    amount: paid,
    entry_date: entryDate,
    note: note || 'Payment received',
    created_by: profile.id,
  });

  if (error) return fail(describe(error, 'Could not record the payment.'));

  revalidatePath(`/admin/customers/${customerId}`);
  revalidatePath('/admin/customers');
  return ok('Payment recorded.');
}

/**
 * A manual correction to the ledger - an opening balance carried over from the
 * old register, or an entry that cancels out an earlier mistake.
 *
 * Nothing is ever edited or deleted: a correction is a new entry pointing the
 * other way, which is what keeps the ledger auditable.
 */
export async function recordLedgerAdjustment(_prevState, formData) {
  let profile;
  try {
    profile = await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const customerId = text(formData, 'customer_id');
  const entryType = text(formData, 'entry_type');
  const amount = number(formData, 'amount');
  const entryDate = text(formData, 'entry_date');
  const note = text(formData, 'note');

  if (!customerId) return fail('Missing the customer.');
  if (!['debit', 'credit'].includes(entryType))
    return fail('Choose whether this adds or reduces what they owe.');
  if (amount === null || amount <= 0) return fail('Enter an amount above zero.');
  if (!entryDate) return fail('Enter a date.');
  if (!note)
    return fail('Write a note explaining this adjustment - it stays on the record permanently.');

  // Whole rupees, like every other entry on the ledger. An adjustment is the
  // tool for squaring an account, and one that could itself leave paisa behind
  // would not finish the job.
  const adjustment = roundRupees(amount);
  if (adjustment <= 0) return fail('An adjustment has to be at least one rupee.');

  const supabase = await createClient();
  const { error } = await supabase.from('ledger_entries').insert({
    customer_id: customerId,
    entry_type: entryType,
    amount: adjustment,
    entry_date: entryDate,
    note,
    created_by: profile.id,
  });

  if (error) return fail(describe(error, 'Could not record the adjustment.'));

  revalidatePath(`/admin/customers/${customerId}`);
  revalidatePath('/admin/customers');
  return ok('Adjustment recorded.');
}

/**
 * Correcting a ledger entry that was typed wrong.
 *
 * NOT AN EDIT, AND CANNOT BE. `ledger_entries` refuses UPDATE and DELETE at the
 * database (002), which is the reason a balance on this screen is worth more
 * than one in a notebook. So the "edit" the owner asked for is a CORRECTION:
 * `correct_ledger_entry` (063) posts a reversal cancelling the wrong row where
 * it stands, and - unless the entry should never have existed - a replacement
 * carrying what it should have said. Both in one statement, because a reversal
 * that lands without its replacement silently wipes a real payment.
 *
 * Every rule about WHICH rows may be corrected lives in the function, not here:
 * a row posted from a reading or a lubricant sale is refused there, so is a row
 * already cancelled, and so is a reversal itself. This validates only what a
 * form can get wrong before the round trip.
 */
export async function correctLedgerEntry(_prevState, formData) {
  try {
    await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const entryId = text(formData, 'entry_id');
  const customerId = text(formData, 'customer_id');
  // A checkbox is absent from the payload when it is unticked, which is exactly
  // the right shape here: the default is to correct, and removing is the case
  // someone has to reach for.
  const remove = formData.get('remove') === 'on';

  if (!entryId) return fail('Missing the entry to correct.');

  let amount = null;
  let entryDate = null;
  let note = null;

  if (!remove) {
    amount = number(formData, 'amount');
    entryDate = text(formData, 'entry_date');
    note = text(formData, 'note');

    if (amount === null || amount <= 0) return fail('Enter what the entry should have been.');
    // Whole rupees, like every other row on this ledger - see roundRupees.
    amount = roundRupees(amount);
    if (amount <= 0) return fail('A ledger entry has to be at least one rupee.');
    if (!entryDate) return fail('Enter the date the entry should carry.');
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('correct_ledger_entry', {
    p_entry_id: entryId,
    p_remove: remove,
    p_amount: amount,
    p_entry_date: entryDate,
    p_note: note || null,
  });

  if (error) return fail(describe(error, 'Could not correct that entry.'));

  if (customerId) revalidatePath(`/admin/customers/${customerId}`);
  revalidatePath('/admin/customers');

  const was = formatPKR(data?.was_amount ?? 0);
  return ok(
    remove
      ? `${was} cancelled. The entry is struck from the balance.`
      : `${was} cancelled and ${formatPKR(data?.now_amount ?? 0)} recorded in its place.`,
  );
}

// ---------------------------------------------------------------------------
// Suppliers - what the pump owes the companies that deliver to it (067)
// ---------------------------------------------------------------------------

/** The supplier's name, read through RLS, or null if it is not there. */
async function supplierNameFor(supabase, supplierId) {
  const { data } = await supabase.from('suppliers').select('name').eq('id', supplierId).maybeSingle();
  return data?.name ?? null;
}

function revalidateSupplier(supplierId) {
  revalidatePath('/admin/suppliers');
  if (supplierId) revalidatePath(`/admin/suppliers/${supplierId}`);
}

/** Adds a supplier, or saves one's details (name, phone, note). Owner only. */
export async function saveSupplier(_prevState, formData) {
  try {
    await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const supplierId = text(formData, 'supplier_id');
  const name = text(formData, 'name');
  const phone = text(formData, 'phone');
  const note = text(formData, 'note');

  if (!name) return fail('Enter the supplier name.');

  const supabase = await createClient();
  const row = { name, phone: phone || null, note: note || null };
  const { error } = supplierId
    ? await supabase.from('suppliers').update(row).eq('id', supplierId)
    : await supabase.from('suppliers').insert(row);

  if (error) return fail(describe(error, 'Could not save the supplier.'));

  revalidateSupplier(supplierId);
  revalidatePath('/admin/purchases');
  return ok(supplierId ? `${name} saved.` : `${name} added, with nothing owed.`);
}

/**
 * Retires a supplier (off the purchase forms, account kept) or brings one back.
 * Never a delete: a supplier with history is a record the ledger points at.
 */
export async function setSupplierActive(_prevState, formData) {
  try {
    await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const supplierId = text(formData, 'supplier_id');
  const active = text(formData, 'active') === 'true';
  if (!supplierId) return fail('Missing the supplier.');

  const supabase = await createClient();
  const { error } = await supabase.from('suppliers').update({ is_active: active }).eq('id', supplierId);
  if (error) return fail(describe(error, 'Could not update the supplier.'));

  revalidateSupplier(supplierId);
  revalidatePath('/admin/purchases');
  return ok(
    active
      ? 'Back on the list. Deliveries can be recorded against this supplier again.'
      : 'Retired. Off the purchase forms; the account and its history are kept.',
  );
}

/**
 * Pays a supplier. The database records the payment AND takes the money out of
 * the safe (cash) or the chosen bank account (transfer) in one transaction, so
 * the three pages cannot disagree - and refuses a payment the safe or the
 * account could not have made, in words.
 */
export async function recordSupplierPayment(_prevState, formData) {
  try {
    await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const supplierId = text(formData, 'supplier_id');
  const amount = number(formData, 'amount');
  const entryDate = text(formData, 'entry_date');
  const paidFrom = text(formData, 'paid_from');
  const bankAccountId = text(formData, 'bank_account_id');
  const note = text(formData, 'note');

  if (!supplierId) return fail('Missing the supplier.');
  if (amount === null || amount <= 0) return fail('Enter the amount paid.');
  if (!entryDate) return fail('Enter the date it was paid.');
  if (!['cash', 'bank'].includes(paidFrom)) return fail('Say whether it was paid in cash or by bank transfer.');
  if (paidFrom === 'bank' && !bankAccountId) return fail('Choose the bank account it was paid from.');

  const supabase = await createClient();
  const { error } = await supabase.rpc('record_supplier_payment', {
    p_supplier_id: supplierId,
    p_amount: roundMoney(amount),
    p_entry_date: entryDate,
    p_paid_from: paidFrom,
    p_bank_account_id: paidFrom === 'bank' ? bankAccountId : null,
    p_note: note || null,
  });

  if (error) return fail(describe(error, 'Could not record the payment.'));

  revalidateSupplier(supplierId);
  revalidatePath(paidFrom === 'bank' ? '/admin/banking' : '/admin/treasury');
  return ok(
    paidFrom === 'bank'
      ? `${formatPKR(amount)} paid by bank transfer, and taken off the account on Banking.`
      : `${formatPKR(amount)} paid in cash, and taken out of the safe on Treasury.`,
  );
}

/**
 * A discount (the supplier took something off) or an adjustment either way (an
 * opening balance, or anything the other entries miss, with a reason).
 */
export async function recordSupplierEntry(_prevState, formData) {
  try {
    await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const supplierId = text(formData, 'supplier_id');
  const kind = text(formData, 'kind');
  const direction = text(formData, 'direction');
  const amount = number(formData, 'amount');
  const entryDate = text(formData, 'entry_date');
  const note = text(formData, 'note');

  if (!supplierId) return fail('Missing the supplier.');
  if (!['discount', 'adjustment'].includes(kind)) return fail('Invalid entry.');
  if (amount === null || amount <= 0) return fail('Enter an amount above zero.');
  if (!entryDate) return fail('Enter the date.');

  const supabase = await createClient();
  const { error } = await supabase.rpc('record_supplier_entry', {
    p_supplier_id: supplierId,
    p_kind: kind,
    p_direction: kind === 'discount' ? 'owe_less' : direction,
    p_amount: roundMoney(amount),
    p_entry_date: entryDate,
    p_note: note || null,
  });

  if (error) return fail(describe(error, 'Could not save the entry.'));

  revalidateSupplier(supplierId);
  return ok(
    kind === 'discount'
      ? `Discount of ${formatPKR(amount)} recorded. The pump owes that much less.`
      : `Adjustment recorded. The pump owes ${formatPKR(amount)} ${direction === 'owe_more' ? 'more' : 'less'}.`,
  );
}

/**
 * Cancels a payment, discount or adjustment with a reversing entry. A payment's
 * money goes back into the safe or the bank account in the same step.
 */
export async function cancelSupplierEntry(_prevState, formData) {
  try {
    await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const entryId = text(formData, 'entry_id');
  const supplierId = text(formData, 'supplier_id');
  if (!entryId) return fail('Missing the entry.');

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('cancel_supplier_entry', { p_entry_id: entryId });
  if (error) return fail(describe(error, 'Could not cancel the entry.'));

  revalidateSupplier(supplierId);
  revalidatePath('/admin/banking');
  revalidatePath('/admin/treasury');

  const money = {
    safe_row_removed: ' The cash went back into the safe.',
    safe_refunded: ' Its row on Treasury had been removed, so the cash was put back into the safe as a new entry.',
    bank_row_removed: ' The transfer was taken off Banking.',
    bank_refunded: ' Its row on Banking was no longer there, so the amount was put back into the account as a new entry.',
    bank_account_gone: ' The bank account it came from has been deleted, so nothing was put back there.',
  }[data?.money] ?? '';
  return ok(`Cancelled.${money}`);
}

// ---------------------------------------------------------------------------
// Configuration - super_admin only
// ---------------------------------------------------------------------------

export async function setFuelPrice(_prevState, formData) {
  try {
    await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const fuelType = text(formData, 'fuel_type');
  const rate = number(formData, 'rate');
  const effectiveFrom = text(formData, 'effective_from');

  if (!['petrol', 'diesel'].includes(fuelType)) return fail('Choose petrol or diesel.');
  if (rate === null || rate <= 0) return fail('Enter a rate above zero.');
  if (!effectiveFrom) return fail('Enter the date this rate starts from.');

  /*
   * One RPC, not an insert: `set_fuel_price` saves the price AND re-prices any
   * readings already saved in the days it governs, in one transaction (066).
   * A price dated today or later normally has nothing to re-price; a price
   * dated back to a day already entered is the owner saying what that day's
   * price was, and those readings are brought onto it. The answer says what
   * moved, so nothing changes without the owner being told.
   */
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('set_fuel_price', {
    p_fuel_type: fuelType,
    p_rate: rate,
    p_effective_from: effectiveFrom,
  });

  if (error) return fail(describe(error, 'Could not save the rate.'));

  revalidateAfterPriceChange();
  const fuel = fuelType === 'petrol' ? 'Petrol' : 'Diesel';
  return ok(
    `${fuel} rate set to ${formatRate(rate)} per litre from ${formatDate(effectiveFrom)}.` +
      repricedSentence(fuel, data),
  );
}

/*
 * Every screen that shows a reading's money, since a price change can now
 * re-price saved readings. `created_by` on the price comes from auth.uid()
 * inside the RPC, so the action no longer needs the profile it used to pass.
 */
function revalidateAfterPriceChange() {
  revalidatePath('/admin/settings');
  revalidatePath('/admin/settings/fuel-prices');
  revalidatePath('/admin/readings');
  revalidatePath('/admin');
  revalidatePath('/admin/reports');
  revalidatePath('/admin/customers');
}

/**
 * What `reprice_readings_for_span` (066) moved, as a sentence: which days, from
 * which rate, and what that fuel's sales on those days came to before and
 * after. Empty when nothing was re-priced, which is the ordinary case.
 */
function repricedSentence(fuel, result) {
  const count = Number(result?.repriced ?? 0);
  const unpriced = Number(result?.unpriced ?? 0);
  let sentence = '';

  if (count > 0) {
    const days =
      result.first_day === result.last_day
        ? formatDate(result.first_day)
        : `${formatDate(result.first_day)} to ${formatDate(result.last_day)}`;
    sentence +=
      ` ${count} ${count === 1 ? 'reading' : 'readings'} already saved for ${days} ` +
      `${count === 1 ? 'was' : 'were'} re-priced from Rs ${result.old_rates} to ` +
      `${formatRate(result.new_rate)}: ${fuel.toLowerCase()} sales on ` +
      `${result.first_day === result.last_day ? 'that day' : 'those days'} went from ` +
      `${formatPKR(result.before)} to ${formatPKR(result.after)}.`;
  }
  if (unpriced > 0) {
    sentence +=
      ` ${unpriced} ${unpriced === 1 ? 'reading has' : 'readings have'} no earlier rate to ` +
      'fall back to and kept the one they were saved at. Set a rate for those days.';
  }
  return sentence;
}

/**
 * Removes a rate. Owner only, and the only way to correct a mistyped one.
 *
 * A fuel and a date can carry one rate, enforced by a unique constraint - so
 * typing 339.48 when you meant 393.48 cannot be fixed by saving again over the
 * top. Without this the wrong price stands for the whole day and every reading
 * entered against it is wrong.
 *
 * WHAT IT DOES TO READINGS ALREADY SAVED. Each reading carries a copy of its
 * rate, which is what stops a price set today rewriting last week. But the days
 * this rate covered now fall back to the rate before it, so their readings are
 * re-priced onto that, in the same transaction as the delete (066). They used
 * to stay on the removed rate until each day was cleared and re-entered. The
 * button says what happens before it acts, and the answer names the days.
 */
export async function deleteFuelPrice(_prevState, formData) {
  try {
    await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const priceId = text(formData, 'price_id');
  if (!priceId) return fail('Missing the rate.');

  // `remove_fuel_price` (066): the days this price covered fall back to the
  // price before it, and their saved readings are re-priced to match, in the
  // same transaction as the delete.
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('remove_fuel_price', { p_price_id: priceId });

  if (error) return fail(describe(error, 'Could not remove the rate.'));

  revalidateAfterPriceChange();
  const fuel = data?.fuel_type === 'petrol' ? 'Petrol' : 'Diesel';
  return ok(`${fuel} rate removed.${repricedSentence(fuel, data)} Set the correct one now if it is needed.`);
}

/**
 * All six nozzles at once - how the pump is plumbed, saved as one thing.
 *
 * Describing the wiring is a single job done once when the pump goes onto the
 * system, so it gets one button rather than six. The rows arrive as three
 * parallel lists because a form serialises repeated field names in the order
 * they appear in the markup, which is what lines index 2 of one list up with
 * index 2 of the next.
 *
 * Everything is validated before anything is sent: a half-valid submission
 * should be refused whole, not applied as far as the first bad row. The write
 * itself is one UPDATE inside set_nozzle_wiring() for the same reason - see
 * migration 022.
 */
export async function setNozzleWiring(_prevState, formData) {
  try {
    await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const ids = formData.getAll('nozzle_id').map((value) => String(value));
  const units = formData.getAll('unit_number').map((value) => String(value).trim());
  const labels = formData.getAll('nozzle_label').map((value) => String(value).trim());
  const tankIds = formData.getAll('tank_id').map((value) => String(value));
  const readings = formData.getAll('starting_reading').map((value) => String(value));

  if (ids.length === 0) return fail('Nothing to save.');
  if (ids.length !== units.length || ids.length !== labels.length) {
    return fail('That form arrived incomplete. Reopen it and try again.');
  }

  /*
   * A FROZEN FIELD SENDS NOTHING, AND EACH ONE FREEZES ON ITS OWN. A nozzle's
   * tank and its starting meter are both read-only in some states (056, 060,
   * and the meter once a day is entered), so the dialog posts nothing for them
   * - which means `tank_id` and `starting_reading` arrive SHORTER than the
   * other two lists and cannot be lined up by the same index.
   *
   * Rather than pad them with placeholders and hope the order survives, the
   * two carry the nozzle id in their name (`tank_id__<id>`), so each is looked
   * up by the row it belongs to instead of by position. The
   * repeated-name-plus-index trick is still right for the fields EVERY row
   * has; it stops being right the moment some rows opt out.
   *
   * THE TWO ARE CHECKED SEPARATELY, and this cost the owner an afternoon. They
   * used to be checked as a pair - if either arrived, both had to - which was
   * true only while every row was either fully frozen (retired) or fully live.
   * The moment 060 froze the TANK on a nozzle that had traded while leaving its
   * meter editable, an ordinary Unit 3 row began posting a starting reading
   * with no tank beside it, and the whole dialog answered "Every nozzle needs a
   * tank" on every save - a message about a field the owner could not even see,
   * naming a row he had not touched.
   *
   * There was never a reason to couple them. `set_nozzle_wiring` coalesces a
   * missing key to "leave this alone" per FIELD, so a row carrying one of the
   * two is a perfectly good instruction. Each is now validated if it is
   * present and ignored if it is not, which is what the RPC underneath has
   * always meant.
   */
  const rows = [];
  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index];
    const unitNumber = Number(units[index]);

    if (!id) return fail('That form arrived incomplete. Reopen it and try again.');
    if (units[index] === '' || !Number.isInteger(unitNumber) || unitNumber <= 0) {
      return fail('Every nozzle needs a unit number, and it has to be a whole number above zero.');
    }
    if (labels[index] === '') {
      return fail('Every nozzle needs a label: it is what is written on the machine.');
    }

    const row = { nozzle_id: id, unit_number: unitNumber, nozzle_label: labels[index] };

    // Present only for a nozzle still in service; omitted keys mean "leave
    // this alone" to set_nozzle_wiring().
    const tankId = formData.get(`tank_id__${id}`);
    const reading = formData.get(`starting_reading__${id}`);

    if (typeof tankId === 'string') {
      if (tankId === '') {
        return fail('Every nozzle needs a tank. Check the list and try again.');
      }
      row.tank_id = tankId;
    }

    if (typeof reading === 'string') {
      const startingReading = Number(reading.trim());

      if (reading.trim() === '' || !Number.isFinite(startingReading)) {
        return fail('Every nozzle needs a starting meter reading, even if it is 0.');
      }
      if (startingReading < 0) {
        return fail('A meter reading cannot be negative.');
      }

      row.starting_reading = roundMoney(startingReading);
    }

    rows.push(row);
  }

  /*
   * NO DUPLICATE-POSITION CHECK HERE, DELIBERATELY. Two nozzles may share a
   * unit number and a label perfectly legitimately, as long as they were not on
   * the forecourt at the same time - the diesel pump replaced on 31 Aug and the
   * one fitted on 1 Sep are both "Unit 2 · Nozzle A" and both correct. Deciding
   * that needs each nozzle's service window, which this action does not have
   * and should not start carrying: the database holds the windows and
   * `nozzles_one_pump_per_position` (058) is an exclusion constraint written
   * over them. A cheaper check here would be a check that is WRONG, and it
   * would refuse the one arrangement this whole feature exists to record.
   */

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('set_nozzle_wiring', { p_rows: rows });

  if (error) return fail(describe(error, 'Could not save the nozzle wiring.'));

  revalidatePath('/admin/settings');
  revalidatePath('/admin/readings');
  revalidatePath('/admin');

  const saved = Number(data ?? rows.length);
  return ok(`Saved. ${saved} ${saved === 1 ? 'nozzle' : 'nozzles'} updated.`);
}

/**
 * A dispensing unit was damaged and swapped for another one.
 *
 * WHAT THIS IS NOT. It is not a way to set a meter back to zero. The old unit's
 * nozzles keep every reading they ever took, exactly as they took them - months
 * of litres, cash, credit and tank movement hang off those rows - and the new
 * unit gets nozzles of its own, starting wherever its meters actually start.
 * See migration 056 for why editing the existing rows is the wrong answer and
 * what it would do to the books.
 *
 * ALL THE REAL CHECKING IS IN replace_unit(). What is validated here is only
 * the shape of the form: whether a date is a date and a number is a number.
 * Whether the unit exists, whether it already has readings past the day it is
 * being retired on, whether the new labels collide - those are questions about
 * the state of the database at the moment of the write, and answering them here
 * would be answering them a second earlier than the answer is worth anything.
 */
export async function replaceUnit(_prevState, formData) {
  try {
    await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const unitNumber = number(formData, 'unit_number');
  const newUnitNumber = number(formData, 'new_unit_number');
  const oldLastDay = text(formData, 'old_last_day');
  const newFirstDay = text(formData, 'new_first_day');
  const tankId = text(formData, 'tank_id');

  if (!Number.isInteger(unitNumber) || unitNumber <= 0) {
    return fail('Pick the unit that was replaced.');
  }
  if (newUnitNumber !== null && (!Number.isInteger(newUnitNumber) || newUnitNumber <= 0)) {
    return fail('A unit number has to be a whole number above zero.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(oldLastDay)) {
    return fail('Give the last day the old unit dispensed.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newFirstDay)) {
    return fail('Give the first day the new unit dispensed.');
  }
  if (newFirstDay < oldLastDay) {
    return fail('The new unit cannot have started before the old one stopped.');
  }
  if (!tankId) {
    return fail('Choose which tank the new unit draws from.');
  }

  // The three fields repeat their names down the table, the same way the
  // nozzle wiring dialog does - a form serialises repeated names in markup
  // order, so the two lists line up by index.
  const labels = formData.getAll('nozzle_label').map((value) => String(value).trim());
  const starts = formData.getAll('starting_reading').map((value) => String(value).trim());

  if (labels.length === 0) return fail('The new unit needs at least one nozzle.');
  if (labels.length !== starts.length) {
    return fail('That form arrived incomplete. Reopen it and try again.');
  }

  const nozzles = [];
  for (let index = 0; index < labels.length; index += 1) {
    const startingReading = Number(starts[index]);

    if (!labels[index]) return fail('Every nozzle on the new unit needs a label.');
    if (starts[index] === '' || !Number.isFinite(startingReading)) {
      return fail('Every nozzle needs a starting meter reading, even if it is 0.');
    }
    if (startingReading < 0) return fail('A meter reading cannot be negative.');

    nozzles.push({
      nozzle_label: labels[index],
      starting_reading: roundMoney(startingReading),
    });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('replace_unit', {
    p_unit_number: unitNumber,
    p_old_last_day: oldLastDay,
    p_new_first_day: newFirstDay,
    p_tank_id: tankId,
    p_nozzles: nozzles,
    p_new_unit_number: newUnitNumber ?? unitNumber,
  });

  if (error) return fail(describe(error, 'Could not record the replacement.'));

  revalidatePath('/admin/settings');
  revalidatePath('/admin/readings');
  revalidatePath('/admin/activity');
  revalidatePath('/admin');

  const added = Number(data?.added ?? nozzles.length);
  const finalUnit = Number(data?.new_unit_number ?? unitNumber);

  return ok(
    `Unit ${unitNumber} was retired after ${formatDate(oldLastDay)}. ` +
      `Unit ${finalUnit} now has ${added} new ${added === 1 ? 'nozzle' : 'nozzles'}, ` +
      `starting ${formatDate(newFirstDay)}.`,
  );
}

export async function updateTank(_prevState, formData) {
  try {
    await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const tankId = text(formData, 'tank_id');
  const capacity = number(formData, 'capacity_litres');
  const openingStock = number(formData, 'opening_stock_litres');
  const openingStockDate = text(formData, 'opening_stock_date');

  if (!tankId) return fail('Missing the tank.');
  if (capacity === null || capacity <= 0) return fail('Enter the tank capacity.');
  if (openingStock === null || openingStock < 0) return fail('Enter the opening stock.');
  if (!openingStockDate) return fail('Enter the date the opening stock applies from.');

  // A tank cannot hold more than it holds. Worth refusing rather than warning:
  // opening stock is what every later litre is measured against, so a figure
  // above capacity quietly overstates the stock on hand from that day onward,
  // and the dashboard reads as fuel that was never in the ground.
  if (openingStock > capacity) {
    return fail(
      `Opening stock cannot be more than the tank holds. ` +
        `This tank holds ${formatLitres(capacity)} and you entered ${formatLitres(openingStock)}. ` +
        `Raise the capacity if the tank really is bigger.`,
    );
  }

  const supabase = await createClient();

  // Same rule as the nozzles: read first, write only if it would change
  // something.
  const { data: current, error: readError } = await supabase
    .from('tanks')
    .select('capacity_litres, opening_stock_litres, opening_stock_date')
    .eq('id', tankId)
    .single();

  if (readError) return fail(describe(readError, 'Could not read the tank.'));

  if (
    Number(current.capacity_litres) === capacity &&
    Number(current.opening_stock_litres) === openingStock &&
    current.opening_stock_date === openingStockDate
  ) {
    return ok('No change - this tank is already set that way.');
  }

  const { error } = await supabase
    .from('tanks')
    .update({
      capacity_litres: capacity,
      opening_stock_litres: openingStock,
      opening_stock_date: openingStockDate,
    })
    .eq('id', tankId);

  if (error) return fail(describe(error, 'Could not update the tank.'));

  revalidatePath('/admin/settings');
  revalidatePath('/admin');
  return ok('Tank updated.');
}

// ---------------------------------------------------------------------------
// The owner sets up his own forecourt (Al Hakeem only - migration 800)
// ---------------------------------------------------------------------------

const FORECOURT_PATHS = [
  '/admin',
  '/admin/settings',
  '/admin/readings',
  '/admin/stock-checks',
  '/admin/purchases',
  '/admin/reports',
];

async function ownerOnly() {
  try {
    await requireRole(ROLES.SUPER_ADMIN);
    return null;
  } catch (error) {
    return fail(error.message);
  }
}

export async function addTank(_prevState, formData) {
  const refused = await ownerOnly();
  if (refused) return refused;

  const name = text(formData, 'name');
  const fuel = text(formData, 'fuel_type');
  const capacity = number(formData, 'capacity_litres');
  const opening = number(formData, 'opening_stock_litres') ?? 0;
  const openingDate = text(formData, 'opening_stock_date') || null;

  if (!name) return fail('Give the tank a name, such as "Diesel Tank 2".');
  if (fuel !== 'petrol' && fuel !== 'diesel') return fail('Choose petrol or diesel.');
  if (capacity === null || capacity <= 0) return fail('Enter how many litres the tank holds.');

  const supabase = await createClient();
  const { error } = await supabase.rpc('add_tank', {
    p_name: name,
    p_fuel: fuel,
    p_capacity: capacity,
    p_opening_stock: opening,
    p_opening_date: openingDate,
  });
  if (error) return fail(describe(error, 'Could not add the tank.'));

  FORECOURT_PATHS.forEach((path) => revalidatePath(path));
  return ok(`${name} added.`);
}

export async function addNozzle(_prevState, formData) {
  const refused = await ownerOnly();
  if (refused) return refused;

  const unit = number(formData, 'unit_number');
  const label = text(formData, 'nozzle_label');
  const tankId = text(formData, 'tank_id');
  const starting = number(formData, 'starting_reading') ?? 0;
  const firstDay = text(formData, 'first_day') || null;

  if (unit === null || unit < 1 || !Number.isInteger(unit)) {
    return fail('Enter the unit (dispenser) number, 1 or more.');
  }
  if (!label) return fail('Give the nozzle a name or number.');
  if (!tankId) return fail('Choose the tank this nozzle draws from.');

  const supabase = await createClient();
  const { error } = await supabase.rpc('add_nozzle', {
    p_unit: unit,
    p_label: label,
    p_tank_id: tankId,
    p_starting: starting,
    p_first_day: firstDay,
  });
  if (error) return fail(describe(error, 'Could not add the nozzle.'));

  FORECOURT_PATHS.forEach((path) => revalidatePath(path));
  return ok(`Unit ${unit}, nozzle ${label} added.`);
}

export async function removeTank(_prevState, formData) {
  const refused = await ownerOnly();
  if (refused) return refused;

  const tankId = text(formData, 'tank_id');
  if (!tankId) return fail('Missing the tank.');

  const supabase = await createClient();
  const { error } = await supabase.rpc('remove_tank', { p_tank_id: tankId });
  if (error) return fail(describe(error, 'Could not remove the tank.'));

  FORECOURT_PATHS.forEach((path) => revalidatePath(path));
  return ok('Tank removed.');
}

export async function removeNozzle(_prevState, formData) {
  const refused = await ownerOnly();
  if (refused) return refused;

  const nozzleId = text(formData, 'nozzle_id');
  if (!nozzleId) return fail('Missing the nozzle.');

  const supabase = await createClient();
  const { error } = await supabase.rpc('remove_nozzle', { p_nozzle_id: nozzleId });
  if (error) return fail(describe(error, 'Could not remove the nozzle.'));

  FORECOURT_PATHS.forEach((path) => revalidatePath(path));
  return ok('Nozzle removed.');
}

export async function createExpense(_prevState, formData) {
  let profile;
  try {
    profile = await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const category = text(formData, 'category');
  const amount = number(formData, 'amount');
  const expenseDate = text(formData, 'expense_date');
  const note = text(formData, 'note');

  if (!category) return fail('Enter a category.');
  // Zero is refused either way; a negative amount is a reimbursement coming
  // back (see 053_expense_recovery_rows.sql) and is allowed through.
  if (amount === null || amount === 0) return fail('Enter an amount above zero.');
  if (!expenseDate) return fail('Enter the date.');

  const supabase = await createClient();
  const { error } = await supabase.from('expenses').insert({
    category,
    amount,
    expense_date: expenseDate,
    note: note || null,
    created_by: profile.id,
  });

  if (error) return fail(describe(error, 'Could not save the expense.'));

  // Reports too: its Expenses total and the profit below it both move.
  revalidatePath('/admin/expenses');
  revalidatePath('/admin/reports');
  return ok('Expense recorded.');
}

/**
 * Removes an expense. Owner only - and the way to fix a mistyped amount, since
 * an expense feeds the profit figure and a wrong one quietly distorts it.
 */
export async function deleteExpense(_prevState, formData) {
  try {
    await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const expenseId = text(formData, 'expense_id');
  if (!expenseId) return fail('Missing the expense.');

  const supabase = await createClient();
  const { error } = await supabase.from('expenses').delete().eq('id', expenseId);

  if (error) return fail(describe(error, 'Could not delete the expense.'));

  revalidatePath('/admin/expenses');
  revalidatePath('/admin/reports');
  return ok('Expense deleted.');
}

// ---------------------------------------------------------------------------
// Staff accounts - super_admin only
//
// There is no public signup. Every login is created here, which is the only
// place the service-role key is used.
// ---------------------------------------------------------------------------

export async function createStaffAccount(_prevState, formData) {
  try {
    await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const email = text(formData, 'email');
  const password = String(formData.get('password') ?? '');
  const fullName = text(formData, 'full_name');
  const role = text(formData, 'role');

  if (!email) return fail('Enter an email address.');
  if (password.length < 8) return fail('The password must be at least 8 characters.');
  if (!fullName) return fail('Enter the person’s name.');
  if (![ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY].includes(role)) return fail('Choose a role.');

  const admin = createAdminClient();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (createError) {
    return fail(describe(createError, 'Could not create the account.'));
  }

  // The trigger on auth.users always creates the profile as data_entry, so the
  // role is set deliberately here, after the super_admin check above.
  const { error: roleError } = await admin
    .from('profiles')
    .update({ role, full_name: fullName })
    .eq('id', created.user.id);

  if (roleError) {
    return fail(
      `The login was created but the role could not be set (${roleError.message}). ` +
        'Set it from the staff list.',
    );
  }

  revalidatePath('/admin/settings');
  return ok(`${fullName} can now sign in.`);
}

export async function setStaffRole(_prevState, formData) {
  const actor = await requireRoleOrFail(ROLES.SUPER_ADMIN);
  if (actor.error) return actor.error;

  const profileId = text(formData, 'profile_id');
  const role = text(formData, 'role');

  if (!profileId) return fail('Missing the account.');
  if (![ROLES.SUPER_ADMIN, ROLES.DATA_ENTRY].includes(role)) return fail('Choose a role.');
  if (profileId === actor.profile.id) {
    return fail('You cannot change your own role - ask the other owner account to do it.');
  }

  const supabase = await createClient();
  const { error } = await supabase.from('profiles').update({ role }).eq('id', profileId);

  if (error) return fail(describe(error, 'Could not change the role.'));

  revalidatePath('/admin/settings');
  return ok('Role updated.');
}

export async function setStaffActive(_prevState, formData) {
  const actor = await requireRoleOrFail(ROLES.SUPER_ADMIN);
  if (actor.error) return actor.error;

  const profileId = text(formData, 'profile_id');
  const isActive = text(formData, 'is_active') === 'true';

  if (!profileId) return fail('Missing the account.');
  if (profileId === actor.profile.id) {
    return fail('You cannot deactivate your own account.');
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('profiles')
    .update({ is_active: isActive })
    .eq('id', profileId);

  if (error) return fail(describe(error, 'Could not update the account.'));

  revalidatePath('/admin/settings');
  return ok(isActive ? 'Account re-enabled.' : 'Account deactivated.');
}

/**
 * Deletes a login for good. Owner only, and the owner's own password is
 * required to go through with it.
 *
 * Why the password. Deactivating is reversible; this is not. The realistic
 * risk is not an attacker, it is the phone left unlocked on the desk in the
 * office - so the one thing an onlooker does not have is asked for.
 *
 * WHAT SURVIVES. The readings, deliveries, expenses and ledger entries this
 * person recorded all stay exactly as they are; only the "recorded by" name
 * against them becomes blank, because the account it pointed at is gone. No
 * money figure moves. Migration 011 is what makes that possible on the ledger,
 * whose append-only trigger would otherwise refuse the change.
 *
 * Deactivating remains the better default and the UI says so - this is for
 * accounts created by mistake, or people who were never really staff.
 */
export async function deleteStaffAccount(_prevState, formData) {
  const actor = await requireRoleOrFail(ROLES.SUPER_ADMIN);
  if (actor.error) return actor.error;

  const profileId = text(formData, 'profile_id');
  const ownerPassword = String(formData.get('owner_password') ?? '');

  if (!profileId) return fail('Missing the account.');
  if (profileId === actor.profile.id) {
    return fail('You cannot delete your own account.');
  }
  if (!ownerPassword) return fail('Enter your own password to confirm.');
  if (!actor.profile.email) {
    return fail('Could not read your email address. Sign out and in again, then retry.');
  }

  // Same throwaway-client trick as the password change: confirm it is really
  // the owner at the keyboard, without disturbing the session doing the work.
  const checkClient = createPasswordCheckClient();
  const { error: checkError } = await checkClient.auth.signInWithPassword({
    email: actor.profile.email,
    password: ownerPassword,
  });

  if (checkError) {
    if (checkError.status === 400 || checkError.code === 'invalid_credentials') {
      return fail('That is not your password. The account has not been deleted.');
    }
    return fail('Could not reach the server just now. Nothing has been deleted.');
  }

  // Deleting the auth user cascades to the profile, which in turn blanks the
  // created_by on everything they recorded. The rows themselves stay.
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(profileId);

  if (error) return fail(describe(error, 'Could not delete the account.'));

  revalidatePath('/admin/settings');
  return ok('Account deleted. What they recorded has been kept.');
}

/** requireRole, but returning the failure instead of throwing. */
async function requireRoleOrFail(...roles) {
  try {
    return { profile: await requireRole(...roles) };
  } catch (error) {
    return { error: fail(error.message) };
  }
}

// ---------------------------------------------------------------------------
// Banking
//
// The owner's own accounts. Every one of these is super_admin only, and the
// RLS policies say the same thing independently.
// ---------------------------------------------------------------------------

export async function createBankAccount(_prevState, formData) {
  try {
    await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const bankName = text(formData, 'bank_name');
  const label = text(formData, 'account_label');
  const accountNumber = text(formData, 'account_number');
  const openingBalance = number(formData, 'opening_balance') ?? 0;

  if (!bankName) return fail('Enter the bank name.');
  if (!label) return fail('Give the account a short name, so you can tell the two apart.');
  if (!Number.isFinite(openingBalance)) return fail('Enter the balance as a number.');

  const supabase = await createClient();
  const { error } = await supabase.from('bank_accounts').insert({
    bank_name: bankName,
    account_label: label,
    account_number: accountNumber || null,
    opening_balance: roundMoney(openingBalance),
  });

  if (error) return fail(describe(error, 'Could not add the account.'));

  revalidatePath('/admin/banking');
  return ok(`${label} added.`);
}

/**
 * Marks one account as the main one: the account the money in / money out form
 * on Banking starts on (migration 065).
 *
 * The switch itself is `set_main_bank_account()`, which clears the old main
 * and sets the new one in one transaction, in the order a unique index needs -
 * see the migration. Before 065 is applied the function does not exist, and
 * PostgREST says so in its own words; that case gets a sentence the owner can
 * act on instead.
 */
export async function setMainBankAccount(_prevState, formData) {
  try {
    await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const accountId = text(formData, 'account_id');
  if (!accountId) return fail('Choose the account to make the main one.');

  const supabase = await createClient();
  const { error } = await supabase.rpc('set_main_bank_account', { p_account_id: accountId });

  if (error) {
    if (error.code === 'PGRST202' || /set_main_bank_account/.test(error.message ?? '')) {
      return fail(
        'The main account cannot be saved yet: the database is missing migration 065 (a main bank account). Apply it in Supabase, then try again.',
      );
    }
    return fail(describe(error, 'Could not change the main account.'));
  }

  revalidatePath('/admin/banking');
  return ok('Main account changed. Money in and money out now start on it.');
}

/**
 * Removes an account and everything recorded against it.
 *
 * Hard delete, on purpose: this is for an account added by mistake or one that
 * has been closed. The transactions go with it, which is why the button asks
 * first and says how many will go.
 */
export async function deleteBankAccount(_prevState, formData) {
  try {
    await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const accountId = text(formData, 'account_id');
  if (!accountId) return fail('Missing the account.');

  const supabase = await createClient();
  const { error } = await supabase.from('bank_accounts').delete().eq('id', accountId);

  if (error) return fail(describe(error, 'Could not delete the account.'));

  revalidatePath('/admin/banking');
  return ok('Account removed.');
}

/**
 * Records money in or out.
 *
 * Nothing here maintains a balance column - the balance is derived from these
 * rows and the account's carried figures every time it is read, so it cannot
 * drift away from the transactions that produced it. Same principle the tank
 * stock already follows.
 */
export async function createBankTransaction(_prevState, formData) {
  let profile;
  try {
    profile = await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const accountId = text(formData, 'account_id');
  const txnType = text(formData, 'txn_type');
  const amount = number(formData, 'amount');
  const txnDate = text(formData, 'txn_date');
  const category = text(formData, 'category');
  const note = text(formData, 'note');

  if (!accountId) return fail('Choose which account.');
  if (txnType !== 'deposit' && txnType !== 'payment') return fail('Choose money in or money out.');
  if (amount === null || amount <= 0) return fail('Enter an amount above zero.');
  if (!txnDate) return fail('Enter the date.');

  const supabase = await createClient();

  // A payment goes through the RPC, never a plain insert. It may have to come
  // out of more than one account, and several inserts that are really one
  // payment must land together or not at all - which only the database can
  // promise. It also works the split out from the balances as they actually
  // are, so the figures the browser posted are a suggestion, not the decision.
  if (txnType === 'payment') {
    const coverIds = formData
      .getAll('cover_account_ids')
      .filter((id) => typeof id === 'string' && id.length > 0 && id !== accountId);

    const { data, error: paymentError } = await supabase.rpc('record_bank_payment', {
      p_account_id: accountId,
      p_amount: roundMoney(amount),
      p_date: txnDate,
      p_category: category || null,
      p_note: note || null,
      p_cover_ids: coverIds,
    });

    if (paymentError) return fail(describe(paymentError, 'Could not record the payment.'));

    revalidatePath('/admin/banking');
    return ok(data?.message ?? 'Payment recorded.');
  }

  const { error } = await supabase.from('bank_transactions').insert({
    account_id: accountId,
    txn_type: 'deposit',
    amount: roundMoney(amount),
    txn_date: txnDate,
    // A category says something about a payment and nothing about a deposit.
    category: null,
    note: note || null,
    created_by: profile.id,
  });

  if (error) return fail(describe(error, 'Could not record the deposit.'));

  revalidatePath('/admin/banking');
  return ok('Deposit recorded.');
}

export async function deleteBankTransaction(_prevState, formData) {
  try {
    await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const txnId = text(formData, 'transaction_id');
  if (!txnId) return fail('Missing the transaction.');

  const supabase = await createClient();
  const { error } = await supabase.from('bank_transactions').delete().eq('id', txnId);

  if (error) return fail(describe(error, 'Could not remove the transaction.'));

  revalidatePath('/admin/banking');
  return ok('Transaction removed.');
}

// ---------------------------------------------------------------------------
// Company assets - super_admin only
//
// What the pump has bought and kept, not spending or takings. See migration
// 036 - the same treatment as banking, in both the database and here.
// ---------------------------------------------------------------------------

// Derived from the shared list rather than typed out again here, so a
// category added to asset-categories.js is valid the moment it exists instead
// of being silently refused by a second, forgotten copy of the same five
// words.
const ASSET_CATEGORY_VALUES = ASSET_CATEGORIES.map((category) => category.value);

export async function createCompanyAsset(_prevState, formData) {
  let profile;
  try {
    profile = await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const name = text(formData, 'name');
  const category = text(formData, 'category') || 'other';
  const purchaseValue = number(formData, 'purchase_value');
  const purchaseDate = text(formData, 'purchase_date');
  const note = text(formData, 'note');

  if (!name) return fail('Enter what was bought.');
  if (!ASSET_CATEGORY_VALUES.includes(category)) return fail('Choose a category.');
  if (purchaseValue === null || purchaseValue <= 0) return fail('Enter what it cost, above zero.');
  if (!purchaseDate) return fail('Enter the date it was bought.');

  const supabase = await createClient();
  const { error } = await supabase.from('company_assets').insert({
    name,
    category,
    purchase_value: purchaseValue,
    purchase_date: purchaseDate,
    note: note || null,
    created_by: profile.id,
  });

  if (error) return fail(describe(error, 'Could not record the asset.'));

  revalidatePath('/admin/company-assets');
  return ok(`${name} added.`);
}

export async function updateCompanyAsset(_prevState, formData) {
  try {
    await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const assetId = text(formData, 'asset_id');
  const name = text(formData, 'name');
  const category = text(formData, 'category') || 'other';
  const purchaseValue = number(formData, 'purchase_value');
  const purchaseDate = text(formData, 'purchase_date');
  const note = text(formData, 'note');

  if (!assetId) return fail('Missing the asset.');
  if (!name) return fail('Enter what was bought.');
  if (!ASSET_CATEGORY_VALUES.includes(category)) return fail('Choose a category.');
  if (purchaseValue === null || purchaseValue <= 0) return fail('Enter what it cost, above zero.');
  if (!purchaseDate) return fail('Enter the date it was bought.');

  const supabase = await createClient();
  const { error } = await supabase
    .from('company_assets')
    .update({
      name,
      category,
      purchase_value: purchaseValue,
      purchase_date: purchaseDate,
      note: note || null,
    })
    .eq('id', assetId);

  if (error) return fail(describe(error, 'Could not save the changes.'));

  revalidatePath('/admin/company-assets');
  return ok('Changes saved.');
}

export async function deleteCompanyAsset(_prevState, formData) {
  try {
    await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const assetId = text(formData, 'asset_id');
  if (!assetId) return fail('Missing the asset.');

  const supabase = await createClient();
  const { error } = await supabase.from('company_assets').delete().eq('id', assetId);

  if (error) return fail(describe(error, 'Could not remove the asset.'));

  revalidatePath('/admin/company-assets');
  return ok('Asset removed.');
}

// ---------------------------------------------------------------------------
// Treasury - super_admin only
//
// Cash into and out of the safe on site. Standalone: nothing here touches
// banking, expenses or the customer ledger, even where an entry describes
// money that also appears in one of them. See migration 044.
// ---------------------------------------------------------------------------

// Derived from the shared lists rather than typed out again, for the reason
// ASSET_CATEGORY_VALUES gives: a second, forgotten copy of the same words is
// how a category added in one place gets silently refused in another.
const TREASURY_CATEGORY_VALUES = {
  in: TREASURY_IN_CATEGORIES.map((category) => category.value),
  out: TREASURY_OUT_CATEGORIES.map((category) => category.value),
};

export async function createTreasuryEntry(_prevState, formData) {
  let profile;
  try {
    profile = await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const direction = text(formData, 'direction');
  const amount = number(formData, 'amount');
  const entryDate = text(formData, 'entry_date');
  const category = text(formData, 'category');
  const details = text(formData, 'details');

  if (direction !== 'in' && direction !== 'out') {
    return fail('Say whether cash came in or went out.');
  }
  if (amount === null || amount <= 0) return fail('Enter an amount above zero.');
  if (!entryDate) return fail('Enter the date.');
  if (!TREASURY_CATEGORY_VALUES[direction].includes(category)) {
    return fail('Choose what this was for.');
  }

  /*
   * A courtesy check, not a rule - the database allows a future date and
   * should, because nothing about a future date is dishonest. What it catches
   * is the typo that matters: 2027 for 2026 parks an entry at the bottom of
   * the sheet for a year, where the running balance still adds up and nobody
   * looks. One day of slack, because the pump's day and the tablet's clock can
   * disagree by a few hours.
   */
  if (entryDate > shiftISODate(todayISO(), 1)) {
    return fail(`That date is in the future. Today is ${formatDate(todayISO())}.`);
  }

  const supabase = await createClient();
  const { error } = await supabase.from('treasury_entries').insert({
    entry_date: entryDate,
    direction,
    amount: roundMoney(amount),
    category,
    details: details || null,
    created_by: profile.id,
  });

  if (error) return fail(describe(error, 'Could not record the entry.'));

  revalidatePath('/admin/treasury');
  return ok(
    direction === 'in'
      ? `${formatPKR(amount)} recorded into the safe.`
      : `${formatPKR(amount)} recorded out of the safe.`,
  );
}

/**
 * Removes one entry.
 *
 * Nothing special happens here, and that is worth saying: the running balance
 * is not stored anywhere, so removing a row simply takes it out of the chain
 * and every balance after it moves. If that would drop the safe below zero at
 * any point, the database refuses the delete and says which line it broke on.
 */
export async function deleteTreasuryEntry(_prevState, formData) {
  try {
    await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const entryId = text(formData, 'entry_id');
  if (!entryId) return fail('Missing the entry.');

  const supabase = await createClient();
  const { error } = await supabase.from('treasury_entries').delete().eq('id', entryId);

  if (error) return fail(describe(error, 'Could not remove the entry.'));

  revalidatePath('/admin/treasury');
  return ok('Entry removed.');
}

/**
 * Throws away the old end of the audit trail.
 *
 * The log gains a line per change - dozens on a working day - and the part of
 * it anyone ever reads is the recent end. Left alone it becomes hundreds of
 * pages with the useful end buried at the top.
 *
 * The period is all that crosses the wire: how many months to KEEP, one of
 * four. The cutoff date is worked out in the database from pump_today(), so
 * the browser cannot name an instant of its own, and the count the dialog
 * showed and the rows that actually go are computed the same way in the same
 * place - see migration 050.
 *
 * Append-only is not weakened by this. A line still cannot be edited, and a
 * single line cannot be picked out and removed: it is a whole period or
 * nothing, the last month is never on offer, and the trim writes its own line
 * into the log saying who did it and how many went.
 */
export async function clearOldActivity(_prevState, formData) {
  try {
    await requireRole(ROLES.SUPER_ADMIN);
  } catch (error) {
    return fail(error.message);
  }

  const keepMonths = number(formData, 'keep_months');
  if (![1, 3, 6, 12].includes(keepMonths)) {
    return fail('Choose how much of the log to keep.');
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('clear_activity_log', {
    p_keep_months: keepMonths,
  });

  if (error) return fail(describe(error, 'Could not clear the old entries.'));

  revalidatePath('/admin/activity');

  const gone = Number(data?.deleted ?? 0);
  const cutoff = data?.cutoff ? formatDate(data.cutoff) : null;

  if (gone === 0) {
    return ok(`Nothing to clear: every entry is newer than ${cutoff ?? 'the cutoff'}.`);
  }

  return ok(
    `${gone} ${gone === 1 ? 'entry' : 'entries'} cleared` +
      (cutoff ? `: everything before ${cutoff} is gone.` : '.'),
  );
}
