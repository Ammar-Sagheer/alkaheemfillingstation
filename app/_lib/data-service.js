/**
 * Every read query in the app lives here.
 *
 * Rules:
 *   - server only, always through the session-bound client, so RLS applies
 *   - anything that aggregates goes through a Postgres RPC rather than pulling
 *     rows into JavaScript and adding them up here
 *   - these throw on failure; pages let the error boundary handle it
 */
import 'server-only';
import { createClient } from './supabase-server';
import { todayISO, shiftISODate } from './date-helpers';
import { byFuelOrder } from './fuel-colors';

/** Turns a Supabase { data, error } into data, or throws something readable. */
function unwrap({ data, error }, what) {
  if (error) {
    throw new Error(`Could not load ${what}: ${error.message}`);
  }
  return data;
}

// ---------------------------------------------------------------------------
// Configuration: tanks, nozzles, prices
// ---------------------------------------------------------------------------

/*
 * Diesel first, then petrol - the order the pump itself is laid out in, which
 * is what the person reading the screen has in his head. `order('fuel_type')`
 * cannot give it: fuel_type is an enum declared petrol-first in migration 001,
 * and Postgres orders enums by declaration. Sorted here so a display choice
 * stays out of the schema. See FUEL_ORDER in app/_lib/fuel-colors.js.
 */
export async function getTanks() {
  const supabase = await createClient();
  const tanks = unwrap(await supabase.from('tanks').select('*'), 'the tanks');
  return [...tanks].sort(byFuelOrder);
}

/*
 * Every nozzle the pump has ever had, live and retired alike.
 *
 * ORDERED BY GENERATION WITHIN A UNIT, not by label. Since migration 056 a unit
 * number can carry two sets of nozzles - the dispenser that was damaged and the
 * one that replaced it - and `commissioned_on` is what tells them apart: null
 * (or the earlier date) is the older pump. Ordering by unit and label alone
 * would interleave the two generations of Unit 1, so the retired A would sit
 * above the new A with the retired B between them and nothing on screen saying
 * which pump was which.
 *
 * Retired rows are returned rather than filtered out on purpose: Settings shows
 * them, so that the record of what stood on the forecourt and when is somewhere
 * the owner can read it. Anything that wants only the live ones filters on
 * `retired_on === null`.
 */
/**
 * Which tanks have ever had a delivery or a dip (Al Hakeem: migration 800).
 * A tank with neither, and no nozzle, may still be removed - a mistake made
 * while setting up. One round trip of embedded counts, never the rows.
 */
export async function getTankUsage() {
  const supabase = await createClient();
  const rows = unwrap(
    await supabase.from('tanks').select('id, fuel_purchases(count), stock_checks(count)'),
    'which tanks are in use',
  );
  return Object.fromEntries(
    rows.map((row) => [
      row.id,
      Number(row.fuel_purchases?.[0]?.count ?? 0) + Number(row.stock_checks?.[0]?.count ?? 0) > 0,
    ]),
  );
}

export async function getNozzles() {
  const supabase = await createClient();
  return unwrap(
    await supabase
      .from('nozzles')
      // The reading COUNT, not the readings. Settings needs one bit per
      // nozzle - has any day been entered against it - because a nozzle that
      // has traded may no longer be re-pointed at another tank (060), and the
      // dialog freezes that cell rather than letting the owner discover the
      // rule from an error. An embedded count is one round trip and never
      // grows; pulling the rows to length-check them would drag six months of
      // readings into a settings page.
      .select('*, tank:tanks(id, name, fuel_type), readings:nozzle_readings(count)')
      .order('unit_number')
      .order('commissioned_on', { nullsFirst: true })
      .order('nozzle_label'),
    'the nozzles',
  );
}

/**
 * The most recent rate changes, for the panel on Settings.
 *
 * A ROW CAP THAT CUTS ON A DATE BOUNDARY, never inside one. This was seven
 * whole days before, because a plain `limit` would show diesel's new rate for
 * a day and leave petrol's off the bottom, and the two are read as a pair -
 * the owner checks that both moved. Seven days is fourteen rows though, which
 * is a scrolling wall in a panel meant to be glanced at; five is the glance.
 *
 * So: keep rows until there are `maxRows`, then keep going only while the date
 * has not changed. The panel shows five or six rows rather than exactly five,
 * and a day is never half-told. "View all rates" holds the rest.
 *
 * The overfetch is what makes one round trip enough: 60 rows leaves room for a
 * day that was corrected several times over without a second query.
 */
export async function getRecentFuelPrices(maxRows = 5) {
  const supabase = await createClient();
  const rows = unwrap(
    await supabase
      .from('fuel_prices')
      .select('*')
      .order('effective_from', { ascending: false })
      // Matches the full history page, so a day's pair always reads in the
      // same order in both places rather than in whatever order it was saved.
      .order('fuel_type')
      .limit(60),
    'the fuel prices',
  );

  const kept = [];
  for (const row of rows) {
    if (kept.length >= maxRows && row.effective_from !== kept.at(-1).effective_from) break;
    kept.push(row);
  }
  return kept;
}

/**
 * The rate each fuel is on for `date`, and the day that rate was set for:
 * `{ diesel: { rate, effective_from }, petrol: { ... } }`, a fuel missing if it
 * has no rate at all yet.
 *
 * Readings uses `effective_from` to notice a rate CARRIED OVER from an earlier
 * day. This pump's prices move most days, and four times (14 Aug, 25 Aug,
 * 12 Sep, 26-27 Sep) a day's readings were saved on the previous rate because
 * the new one was set afterwards. See migration 066.
 *
 * The same rule as `current_fuel_rate()` in the database - the latest price
 * dated on or before the day - so the notice and the rate a reading is saved at
 * cannot disagree about which price is in force.
 */
export async function getRatesInForce(date) {
  const supabase = await createClient();
  const rows = unwrap(
    await supabase
      .from('fuel_prices')
      .select('fuel_type, rate, effective_from')
      .lte('effective_from', date)
      .order('effective_from', { ascending: false })
      .limit(60),
    'the rates in force',
  );

  const inForce = {};
  for (const row of rows) {
    if (!inForce[row.fuel_type]) inForce[row.fuel_type] = row;
  }
  return inForce;
}

/**
 * One page of the full rate history, plus how many there are in total.
 *
 * `count: 'exact'` rides along on the same request - the total is needed to
 * draw the pager, and asking for it separately would be a second round trip
 * for a number the database has already worked out.
 */
export async function getFuelPricesPage({ page = 1, perPage = 25 } = {}) {
  const supabase = await createClient();
  const from = (page - 1) * perPage;

  const { data, error, count } = await supabase
    .from('fuel_prices')
    .select('*', { count: 'exact' })
    .order('effective_from', { ascending: false })
    .order('fuel_type')
    .range(from, from + perPage - 1);

  if (error) {
    throw new Error(`Could not load the fuel prices: ${error.message}`);
  }

  return { rows: data ?? [], total: count ?? 0 };
}

/**
 * One page of the activity trail, newest first, plus how many there are.
 *
 * Nothing is joined and nothing is looked up: every line was written as a
 * finished sentence by the trigger in migration 035, at the moment the change
 * happened. That is not a shortcut, it is the requirement - half these lines
 * describe rows that no longer exist, and a join would render them as blanks.
 *
 * There is no role check here because the row-level policy is the check: only
 * a super_admin can select from this table at all, so a staff login asking for
 * it gets an empty page rather than somebody else's day.
 *
 * `who` narrows to one person, which is the question actually asked of a log:
 * not "what happened to this row" but "what did they do". It matches a column
 * the log holds itself, so filtering does not need another table either.
 */
export async function getActivityLog({ page = 1, perPage = 20, who } = {}) {
  const supabase = await createClient();
  const from = (page - 1) * perPage;

  let query = supabase
    .from('activity_log')
    .select('*', { count: 'exact' })
    .order('occurred_at', { ascending: false })
    .order('id', { ascending: false });

  if (who) query = query.eq('actor_id', who);

  const { data, error, count } = await query.range(from, from + perPage - 1);

  if (error) {
    throw new Error(`Could not load the activity log: ${error.message}`);
  }

  return { rows: data ?? [], total: count ?? 0 };
}

/**
 * What clearing the old end of the log would remove, per retention period.
 *
 * The dialog cannot honestly offer "clear entries older than six months"
 * without saying how many that is, and the four counts plus the span of the log
 * come back in one round trip - see activity_log_trim_counts in migration 050.
 * The cutoff maths lives in the database so the figure shown and the figure
 * deleted cannot drift apart.
 *
 * Owner only, in the function itself. It returns null rather than throwing if
 * the log cannot be read, because this feeds a button beside the page: a page
 * that renders without the button is better than a page that does not render.
 */
export async function getActivityTrimCounts() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('activity_log_trim_counts');

  if (error) return null;
  return data ?? null;
}

/**
 * The rate in force for each fuel, as { petrol: 280, diesel: 275 }.
 *
 * The date is always sent explicitly rather than left to the database default,
 * so the app and Postgres cannot disagree about which day it is.
 */
export async function getCurrentRates(onDate) {
  const supabase = await createClient();
  const rates = {};
  const date = onDate ?? todayISO();

  for (const fuelType of ['petrol', 'diesel']) {
    const { data, error } = await supabase.rpc('current_fuel_rate', {
      p_fuel_type: fuelType,
      p_date: date,
    });
    if (error) throw new Error(`Could not load the ${fuelType} rate: ${error.message}`);
    rates[fuelType] = data === null ? null : Number(data);
  }

  return rates;
}

// ---------------------------------------------------------------------------
// Daily readings
// ---------------------------------------------------------------------------

/**
 * The whole daily entry screen in one call: every nozzle with its opening
 * reading prefilled, the rate for the day, and anything already entered.
 */
export async function getReadingSheet(date) {
  const supabase = await createClient();
  return unwrap(
    await supabase.rpc('get_reading_sheet', { p_date: date }),
    "the day's reading sheet",
  );
}

/**
 * Credit slips for a set of readings, keyed by reading id.
 *
 * Takes ids rather than filtering through the parent table, because filtering
 * on an embedded resource in PostgREST is easy to get subtly wrong.
 */
export async function getCreditSalesForReadings(readingIds = []) {
  if (readingIds.length === 0) return {};

  const supabase = await createClient();
  const rows = unwrap(
    await supabase
      .from('credit_sales')
      .select('*, customer:customers(id, name, vehicle_number)')
      .in('reading_id', readingIds),
    'the credit slips',
  );

  return rows.reduce((byReading, row) => {
    (byReading[row.reading_id] ||= []).push(row);
    return byReading;
  }, {});
}

export async function getRecentReadings(limit = 60) {
  const supabase = await createClient();
  return unwrap(
    await supabase
      .from('nozzle_readings')
      .select('*, nozzle:nozzles(unit_number, nozzle_label, tank:tanks(fuel_type))')
      .order('reading_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit),
    'the recent readings',
  );
}

// ---------------------------------------------------------------------------
// Fuel purchases
// ---------------------------------------------------------------------------

/*
 * Every fuel delivery, uncapped.
 *
 * It used to stop at 100, which quietly broke the figure that matters most on
 * that screen: the Purchases page adds up what is still owed to suppliers ACROSS
 * ALL ROWS, so once the hundred-and-first delivery was recorded the oldest
 * unpaid ones dropped out of the sum and the pump under-reported its own debt.
 * A cap on a list you are going to total is a cap on the total.
 *
 * The page shows a page at a time - see Pager - but it needs the whole set to
 * work the total out from. Deliveries are a handful a week, so this stays small
 * for years; if it ever does not, the pending total wants its own aggregate
 * query before this cap comes back.
 */
export async function getPurchases() {
  const supabase = await createClient();
  return unwrap(
    await supabase
      .from('fuel_purchases')
      .select('*, tank:tanks(id, name, fuel_type)')
      .order('purchase_date', { ascending: false })
      .order('created_at', { ascending: false }),
    'the fuel purchases',
  );
}

// ---------------------------------------------------------------------------
// Lubricants
//
// The shelf of engine oil and the rest: the products, what comes in from the
// distributor, and what goes out over the counter. Everything is measured in
// litres, whether it left as a sealed 4 L carton or as 250 ml poured loose.
// ---------------------------------------------------------------------------

/** The product list. Retired products are left out unless asked for. */
export async function getLubricants({ includeRetired = false } = {}) {
  const supabase = await createClient();

  let query = supabase.from('lubricants').select('*');
  if (!includeRetired) query = query.eq('is_active', true);

  return unwrap(await query.order('name'), 'the lubricants');
}

/**
 * The shelf as at a date: bought, sold and what is left, per product.
 *
 * Aggregated in Postgres like every other stock figure, so the Stock page and
 * the monthly report cannot arrive at different answers.
 */
export async function getLubricantStock(date) {
  const supabase = await createClient();
  return unwrap(
    await supabase.rpc('get_lubricant_stock', { p_date: date ?? todayISO() }),
    'the lubricant stock',
  );
}

/** One day of counter sales with its totals - the whole Lubricants screen. */
export async function getLubricantDay(date) {
  const supabase = await createClient();
  return unwrap(
    await supabase.rpc('get_lubricant_day', { p_date: date ?? todayISO() }),
    "the day's lubricant sales",
  );
}

/** The other half of the Purchases page, uncapped for the same reason. */
export async function getLubricantPurchases() {
  const supabase = await createClient();
  return unwrap(
    await supabase
      .from('lubricant_purchases')
      .select('*, lubricant:lubricants(id, name, pack_size_litres, sold_loose)')
      .order('purchase_date', { ascending: false })
      .order('created_at', { ascending: false }),
    'the lubricant purchases',
  );
}

// ---------------------------------------------------------------------------
// Stock checks
// ---------------------------------------------------------------------------

/*
 * Every dip that has been recorded, uncapped.
 *
 * The Stock page looks up THE CHECK FOR THE DATE ON SCREEN in this list, so a
 * cap meant stepping back far enough made the page believe an older day had
 * never been checked - and offer to record it again. Same shape of bug as the
 * purchases cap: the list is not only a list, something is derived from it.
 */
export async function getStockChecks() {
  const supabase = await createClient();
  return unwrap(
    await supabase
      .from('stock_checks')
      .select('*, tank:tanks(id, name, fuel_type)')
      .order('check_date', { ascending: false }),
    'the stock checks',
  );
}

/**
 * The most recent dip for one tank, or null if it has never been dipped.
 *
 * Ordered by `books_date` - the trading day the dip CLOSES (migration 039),
 * not `check_date`, the day the rod physically went in. A morning dip closes
 * the day before it was taken, so sorting by `check_date` could hand back a
 * dip that reads as "most recent" while actually closing an earlier day than
 * one taken the previous evening.
 *
 * One tank per call rather than `getStockChecks()` filtered in JS - that list
 * has no cap for exactly the reason its own comment gives (a capped list lies
 * about "does this date have a check"), so pulling the WHOLE history just to
 * find one tank's latest row is the unbounded-list trap this file has already
 * been burned by once.
 */
export async function getLastStockCheck(tankId) {
  const supabase = await createClient();
  return unwrap(
    await supabase
      .from('stock_checks')
      .select('books_date, gain_loss')
      .eq('tank_id', tankId)
      .order('books_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    'the last dip',
  );
}

/** What the books say should be in a tank at the end of a given date. */
export async function getExpectedStock(tankId, date) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('calculate_expected_stock', {
    p_tank_id: tankId,
    p_date: date,
  });
  if (error) throw new Error(`Could not work out the expected stock: ${error.message}`);
  return data === null ? null : Number(data);
}

/*
 * Expected stock for every tank, ready for the stock check form.
 *
 * TWO figures per tank, not one. A dip taken on the morning of the 11th closes
 * the 10th; one taken after the pumps stop on the 11th closes the 11th. Which
 * of the two the form is asking about is a choice the person recording it makes
 * on screen, so both arrive with the page and the card shows whichever is
 * selected - rather than a round trip to the server for a number that was
 * already one query away.
 */
export async function getExpectedStockForAllTanks(date) {
  const tanks = await getTanks();
  const previous = shiftISODate(date, -1);
  return Promise.all(
    tanks.map(async (tank) => {
      const [ifEvening, ifMorning] = await Promise.all([
        getExpectedStock(tank.id, date),
        getExpectedStock(tank.id, previous),
      ]);
      return { ...tank, expected_if_evening: ifEvening, expected_if_morning: ifMorning };
    }),
  );
}

// ---------------------------------------------------------------------------
// Customers and the ledger
// ---------------------------------------------------------------------------

export async function getCustomers() {
  const supabase = await createClient();
  const rows = unwrap(
    await supabase
      .from('customers')
      // Each with their vehicles (801): the credit forms offer them under the
      // customer, and the Readings slip finds an account from a vehicle number.
      .select('*, vehicles:customer_vehicles(id, vehicle_number, is_active)')
      .eq('is_active', true)
      .order('name'),
    'the customers',
  );
  return rows.map((customer) => ({
    ...customer,
    vehicles: (customer.vehicles ?? [])
      .filter((vehicle) => vehicle.is_active)
      .sort((a, b) => a.vehicle_number.localeCompare(b.vehicle_number, 'en', { numeric: true })),
  }));
}

/** One customer's vehicles (801), retired ones too: the customer page lists both. */
export async function getCustomerVehicles(customerId) {
  const supabase = await createClient();
  const rows = unwrap(
    await supabase
      .from('customer_vehicles')
      .select('id, vehicle_number, is_active, created_at')
      .eq('customer_id', customerId),
    'the vehicles',
  );
  return rows.sort(
    (a, b) =>
      Number(b.is_active) - Number(a.is_active) ||
      a.vehicle_number.localeCompare(b.vehicle_number, 'en', { numeric: true }),
  );
}

/**
 * Every active vehicle number, by customer (801), for the Customers list: a
 * fleet reads "5 vehicles" under its name, and the search finds an account by
 * any of its numbers, not only the one in the old vehicle box.
 */
export async function getFleetNumbers() {
  const supabase = await createClient();
  const rows = unwrap(
    await supabase.from('customer_vehicles').select('customer_id, vehicle_number').eq('is_active', true),
    'the vehicle numbers',
  );
  const byCustomer = {};
  for (const row of rows) (byCustomer[row.customer_id] ??= []).push(row.vehicle_number);
  return byCustomer;
}

/** What each vehicle on an account has taken on credit (801), all time. */
export async function getCustomerVehicleTotals(customerId) {
  const supabase = await createClient();
  return unwrap(
    await supabase.rpc('get_customer_vehicle_totals', { p_customer_id: customerId }),
    'what each vehicle took',
  );
}

/** Every customer with their outstanding balance - one query, not one each. */
export async function getCustomerBalances() {
  const supabase = await createClient();
  return unwrap(await supabase.rpc('get_customer_balances'), 'the customer balances');
}

/**
 * The customers taken off the list.
 *
 * get_customer_balances returns only active ones - that is the working list,
 * and the figure the Customers page totals. This is the other half, so
 * "removed" never means "lost": a retired account can always be found and
 * brought back, and its balance comes along so a non-zero one cannot hide
 * behind is_active.
 */
export async function getRetiredCustomers() {
  const supabase = await createClient();
  return unwrap(await supabase.rpc('get_retired_customers'), 'the removed customers');
}

export async function getCustomerStatement(customerId) {
  const supabase = await createClient();
  return unwrap(
    await supabase.rpc('get_customer_statement', { p_customer_id: customerId }),
    'the customer statement',
  );
}

/*
 * One customer's ledger, a page at a time, each row carrying the balance after
 * it.
 *
 * Paged in the DATABASE rather than fetched whole and sliced, unlike purchases
 * and stock checks: nothing on the customer page is derived from these rows.
 * The balance and the fuel/lubricant breakdown come from get_customer_statement,
 * which sums in Postgres over everything. So the list is only ever a list, and
 * there is no reason to carry rows the screen will not show.
 *
 * A regular haulier can run to hundreds of entries a year, which is what makes
 * this the one growing table worth paging properly.
 *
 * AN RPC RATHER THAN A SELECT, since migration 064, for the one thing on the row
 * that is NOT just the row: `balance_after`. The table used to work it out here
 * - sort the page oldest first, run a total through it from zero - which was
 * right while the page WAS the whole ledger and silently wrong from the day the
 * pager arrived. Zero is the balance before the customer's first ever entry, and
 * that entry is on the last page; every figure on page 1 was out by the net of
 * everything older. A customer owing Rs 97,515 had Rs -59,728 against his newest
 * row.
 *
 * It cannot be fixed by fetching more rows - that gives back the reason the
 * table is paged - and it should not be added up here in any case: a running
 * balance is `customer_balance()` stopped part way, and this app does not
 * compute in a double a money figure Postgres computes in `numeric`. The window
 * function in 064 runs over every row the customer has and the page is taken
 * afterwards, so a row reads the same whichever page it lands on.
 *
 * The RPC also returns the pager's count and `corrected_ids` - which entries
 * have been cancelled, for the WHOLE customer rather than the page, because
 * `corrects_entry_id` points FORWARD (it is set on the reversal, naming the row
 * it cancels) and an August mistake corrected in September has its two halves on
 * different pages. Deriving that from the page alone would strike a row through
 * on one page and leave it live on another. It was already a second query; it is
 * now part of the same one.
 */
export async function getLedgerEntriesPage(customerId, { page = 1, perPage = 25 } = {}) {
  const supabase = await createClient();

  const result = unwrap(
    await supabase.rpc('get_ledger_entries_page', {
      p_customer_id: customerId,
      p_limit: perPage,
      p_offset: (page - 1) * perPage,
    }),
    'the ledger entries',
  );

  return {
    rows: result?.rows ?? [],
    total: Number(result?.total ?? 0),
    correctedIds: result?.corrected_ids ?? [],
  };
}

/**
 * One customer's WHOLE ledger, oldest first, each row carrying the balance after
 * it - for the printed statement.
 *
 * The deliberate opposite of getLedgerEntriesPage above, and for a reason worth
 * writing down: that one pages because the screen only ever LISTS rows. The
 * statement IS the account - every fill, every payment, and what was owed after
 * each - so a page of 25 would print a document that stops in the middle of
 * August without a line saying it had.
 *
 * AN RPC (064), which also settles the batching this used to do by hand:
 * PostgREST caps a table read at 1,000 rows by default and hands back the first
 * 1,000 without complaining, so this looped until it saw a short page. A regular
 * haulier runs to a few hundred entries a year, so the cap was years away and not
 * never - and the failure it produces is a statement that looks entirely normal
 * and asks for the wrong money. One jsonb value has no such cap.
 */
export async function getLedgerEntriesForStatement(customerId) {
  const supabase = await createClient();

  return (
    unwrap(
      await supabase.rpc('get_ledger_entries_for_statement', { p_customer_id: customerId }),
      'the ledger entries',
    ) ?? []
  );
}

// ---------------------------------------------------------------------------
// Dashboard and reports - all aggregated in Postgres
// ---------------------------------------------------------------------------

export async function getDailySummary(date) {
  const supabase = await createClient();
  return unwrap(await supabase.rpc('get_daily_summary', { p_date: date }), "the day's summary");
}

export async function getSalesTrend(from, to) {
  const supabase = await createClient();
  return unwrap(
    await supabase.rpc('get_sales_trend', { p_from: from, p_to: to }),
    'the sales trend',
  );
}

/**
 * The same date spine as getSalesTrend, for the oil side: what the shelf took
 * and what the drum took, per day.
 *
 * Its own RPC rather than more columns on get_sales_trend, which two screens
 * read and neither of which wants these - see migration 029.
 */
export async function getLubricantTrend(from, to) {
  const supabase = await createClient();
  return unwrap(
    await supabase.rpc('get_lubricant_trend', { p_from: from, p_to: to }),
    'the lubricant sales trend',
  );
}

/**
 * The first day the pump traded, or null if it never has.
 *
 * The daily history pages backwards from today, so it needs to know where to
 * stop - otherwise the pager would run on into empty days forever. Fuel and
 * lubricants are both asked, because a day selling only oil is still a day.
 */
export async function getFirstTradingDay() {
  const supabase = await createClient();

  const [readings, lubricants] = await Promise.all([
    supabase.from('nozzle_readings').select('reading_date').order('reading_date').limit(1),
    supabase.from('lubricant_sales').select('sale_date').order('sale_date').limit(1),
  ]);

  const days = [readings.data?.[0]?.reading_date, lubricants.data?.[0]?.sale_date].filter(Boolean);
  if (days.length === 0) return null;

  return days.sort()[0];
}

/**
 * The Daily Sale & Stock Register: one row per tank per day over a range.
 *
 * Rows come back ordered by fuel then day, which is the order they are read -
 * a register is read down a column, and the cumulative figures on it only mean
 * anything in date order. The page groups by tank without re-sorting.
 *
 * See migration 041 for what each column is and why the variance is derived
 * from the four columns beside it rather than read off `stock_checks`.
 */
export async function getStockRegister(from, to) {
  const supabase = await createClient();
  return unwrap(
    await supabase.rpc('get_stock_register', { p_from: from, p_to: to }),
    'the stock register',
  );
}

/**
 * Sales, stock bought, the cost of stock sold, expenses and profit over an
 * arbitrary run of days.
 *
 * getMonthlyReport answers the same question for a whole calendar month and
 * cannot answer it for any other span - it takes a year and a month, not two
 * dates. Same arithmetic in both; if one changes, both change.
 */
export async function getRangeSummary(from, to) {
  const supabase = await createClient();
  return unwrap(
    await supabase.rpc('get_range_summary', { p_from: from, p_to: to }),
    'the summary for those days',
  );
}

/**
 * Daily totals for the register's money tiles, one row per day that has any.
 *
 * TWO NARROW READS RATHER THAN A NEW RPC. Every other figure on the register
 * comes from `get_range_summary`, which returns totals only - it has no
 * per-day breakdown, and adding one would be a migration written to feed a
 * decoration. These select two columns over a bounded date range and add them
 * up in JavaScript, which for one month of deliveries and expenses is a few
 * dozen rows.
 *
 * NO `limit`, DELIBERATELY. `getExpenses` takes one and defaults it to 100,
 * which is right for a table that pages - and would be silently wrong here:
 * a cap on a list you are going to total is a cap on the total, so the 101st
 * expense of a month would just vanish from the line. See "Two traps, both
 * hit for real" in the skill's ui-patterns notes; this is that trap, and the
 * reason these are separate functions rather than a reused one.
 *
 * The grouping is by the business date the row is FILED under - `purchase_date`
 * and `expense_date` - not `created_at`. A delivery entered on the 5th against
 * the 3rd belongs to the 3rd, which is the same rule every other figure in
 * the app follows.
 */
export async function getPurchaseTotalsByDay(from, to) {
  const supabase = await createClient();
  const rows = unwrap(
    await supabase
      .from('fuel_purchases')
      .select('purchase_date, total_cost')
      .gte('purchase_date', from)
      .lte('purchase_date', to),
    'the deliveries for those days',
  );

  return sumByDay(rows, 'purchase_date', 'total_cost');
}

export async function getExpenseTotalsByDay(from, to) {
  const supabase = await createClient();
  const rows = unwrap(
    await supabase
      .from('expenses')
      .select('expense_date, amount')
      .gte('expense_date', from)
      .lte('expense_date', to),
    'the expenses for those days',
  );

  return sumByDay(rows, 'expense_date', 'amount');
}

/** `[{ purchase_date, total_cost }]` -> `{ '2026-08-03': 41200 }`. */
function sumByDay(rows, dateKey, valueKey) {
  const byDay = {};
  for (const row of rows ?? []) {
    const day = row[dateKey];
    if (!day) continue;
    byDay[day] = (byDay[day] ?? 0) + Number(row[valueKey] ?? 0);
  }
  return byDay;
}

export async function getMonthlyReport(year, month) {
  const supabase = await createClient();
  return unwrap(
    await supabase.rpc('get_monthly_report', { p_year: year, p_month: month }),
    'the monthly report',
  );
}

/**
 * Each fuel's stock at the close of a month and at the close of the day
 * before it began: litres, the cost rate profit carries it at, its value, and
 * the pump price and pump-price value beside them (migration 068). Totals come
 * back from Postgres too, so the page adds no money up itself.
 */
export async function getMonthEndStock(year, month) {
  const supabase = await createClient();
  return unwrap(
    await supabase.rpc('get_month_end_stock', { p_year: year, p_month: month }),
    'the stock at month end',
  );
}

// ---------------------------------------------------------------------------
// Expenses and staff accounts (super_admin only - RLS enforces it)
// ---------------------------------------------------------------------------

/**
 * The recorded expenses, newest first.
 *
 * `from`/`to` are inclusive ISO dates - the Expenses page passes the month on
 * screen, so its table and its totals describe the same set of rows. Left out,
 * it returns the most recent ones regardless of month.
 */
export async function getExpenses({ from, to, limit = 100 } = {}) {
  const supabase = await createClient();

  let query = supabase.from('expenses').select('*');
  if (from) query = query.gte('expense_date', from);
  if (to) query = query.lte('expense_date', to);

  return unwrap(
    await query.order('expense_date', { ascending: false }).limit(limit),
    'the expenses',
  );
}

/**
 * Every category the owner has actually used, most-used first.
 *
 * The Expenses form offers a fixed list of seven suggestions, and the pump's
 * real data shows what that costs on its own: most rows had fallen into
 * "Other", and one category had become the sentence "salary of haseeb and pump
 * tea and lunch". A free-text box with no memory invites a new spelling every
 * time, and the by-category breakdown is only as useful as the consistency of
 * what was typed into it.
 *
 * Ordering by frequency rather than alphabetically puts the handful he uses
 * every month at the top of the list, which is where the reuse actually comes
 * from.
 */
export async function getExpenseCategories() {
  const supabase = await createClient();
  const rows = unwrap(
    await supabase.from('expenses').select('category').limit(2000),
    'the expense categories',
  );

  const counts = new Map();
  for (const row of rows) {
    const category = String(row.category ?? '').trim();
    if (category) counts.set(category, (counts.get(category) ?? 0) + 1);
  }

  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([category]) => category);
}

export async function getProfiles() {
  const supabase = await createClient();
  return unwrap(
    await supabase.from('profiles').select('*').order('full_name'),
    'the staff accounts',
  );
}

// ---------------------------------------------------------------------------
// Banking
//
// The owner's own accounts: cash paid in, pump costs paid out by transfer.
// Owner only - the RLS policies refuse a data_entry caller outright.
// ---------------------------------------------------------------------------

/** Each account with its balance and lifetime totals, from the view. */
/**
 * The suppliers, for the purchase forms: names only, active first. Any logged-in
 * member of staff can read these (067), because recording a delivery is staff
 * work; what is owed to each is not in this read and is owner-only.
 */
export async function getSupplierNames() {
  const supabase = await createClient();
  return unwrap(
    await supabase
      .from('suppliers')
      .select('id, name, is_active')
      .order('is_active', { ascending: false })
      .order('name'),
    'the suppliers',
  );
}

/**
 * Every supplier with what the pump owes them, and what was bought, paid and
 * discounted, net of cancellations. Summed in Postgres (067) so the list, the
 * supplier's own page and its running balance are one piece of arithmetic.
 */
export async function getSupplierSummaries() {
  const supabase = await createClient();
  return unwrap(await supabase.rpc('get_supplier_summaries'), 'the supplier accounts') ?? [];
}

/**
 * One page of one supplier's account, newest first, each row carrying what was
 * owed after it - summed over the WHOLE account in Postgres, the way 064 does it
 * for customers, so a row reads the same on whichever page it falls.
 */
export async function getSupplierLedgerPage(supplierId, { page = 1, perPage = 25 } = {}) {
  const supabase = await createClient();
  const result = unwrap(
    await supabase.rpc('get_supplier_ledger_page', {
      p_supplier_id: supplierId,
      p_limit: perPage,
      p_offset: (page - 1) * perPage,
    }),
    'the supplier account',
  );
  return {
    rows: result?.rows ?? [],
    total: Number(result?.total ?? 0),
    correctedIds: result?.corrected_ids ?? [],
  };
}

export async function getBankAccounts() {
  const supabase = await createClient();
  return unwrap(
    await supabase.from('bank_account_balances').select('*').order('created_at'),
    'the bank accounts',
  );
}

/**
 * One page of bank transactions, newest first across every account, and how
 * many there are in all.
 *
 * PAGED IN POSTGRES since migration 070 removed the 60-per-account cap: the
 * list now grows for ever, and a plain select would stop silently at
 * PostgREST's 1,000-row ceiling. `count: 'exact'` rides along on the same
 * request for the pager. Each account's own count comes from
 * `bank_account_balances.kept_count`, not from these rows.
 */
export async function getBankTransactionsPage({ page = 1, perPage = 25 } = {}) {
  const supabase = await createClient();
  const from = (page - 1) * perPage;

  const { data, error, count } = await supabase
    .from('bank_transactions')
    .select('*, account:bank_accounts(id, bank_name, account_label)', { count: 'exact' })
    .order('txn_date', { ascending: false })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, from + perPage - 1);

  return { rows: unwrap({ data, error }, 'the bank transactions'), total: count ?? 0 };
}

// ---------------------------------------------------------------------------
// Company assets
//
// What the pump has bought and kept: vehicles, machinery, equipment,
// property. Owner-only, and no effect on sales, expenses or profit - see
// migration 036.
// ---------------------------------------------------------------------------

/**
 * One page of assets, newest purchase first, plus how many there are.
 *
 * `count: 'exact'` rides along on the same request for the same reason as
 * getFuelPricesPage - the pager needs the total, and asking separately would
 * be a second round trip for a number the database has already worked out.
 */
export async function getCompanyAssetsPage({ page = 1, perPage = 9 } = {}) {
  const supabase = await createClient();
  const from = (page - 1) * perPage;

  const { data, error, count } = await supabase
    .from('company_assets')
    .select('*', { count: 'exact' })
    .order('purchase_date', { ascending: false })
    .order('created_at', { ascending: false })
    .range(from, from + perPage - 1);

  if (error) {
    throw new Error(`Could not load the company assets: ${error.message}`);
  }

  return { rows: data ?? [], total: count ?? 0 };
}

/**
 * Total value, count, the priciest category and the newest addition - the
 * figures the page leads with.
 *
 * An RPC rather than a client-side sum over the page above, on purpose: the
 * page is capped at `perPage` rows and a total worked out from only one page
 * of them would be wrong the moment a second page exists. See
 * `get_company_assets_summary()` for the full reasoning - it is the same
 * lesson `getPurchases()` already carries a comment about.
 */
export async function getCompanyAssetsSummary() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_company_assets_summary').single();

  if (error) {
    throw new Error(`Could not load the assets summary: ${error.message}`);
  }

  return (
    data ?? {
      asset_count: 0,
      total_value: 0,
      top_category: null,
      top_category_value: 0,
      newest_name: null,
      newest_date: null,
    }
  );
}

// ---------------------------------------------------------------------------
// Treasury
//
// The cash in the safe on the pump site - the owner's "Tajori" sheet. Owner
// only; the RLS policy on treasury_entries refuses a data_entry caller
// outright, so these throw rather than quietly returning nothing for staff.
// See migration 044.
// ---------------------------------------------------------------------------

/**
 * The balance, the lifetime totals, and the day-by-day series behind the
 * chart, in one call.
 *
 * Straight through to the RPC rather than summed here, so the figure in the
 * tile, the point the chart ends on and the balance on the last row of the
 * table are all the same arithmetic done once. `p_days` only moves the window
 * figures - the balance is the balance.
 */
export async function getTreasuryOverview(days = 30) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('treasury_overview', { p_days: days });

  if (error) {
    throw new Error(`Could not load the treasury summary: ${error.message}`);
  }

  return data;
}

/**
 * One day of the safe's sheet: its entries with running balances, the day's
 * own opening and closing, and which days sit either side of it.
 *
 * The unit of a page here is a DAY rather than a row count - see migration
 * 047. `date` may be anything, including a day with no entries; the RPC
 * resolves it to the nearest day that has some, so this never returns a page
 * with nothing on it. Pass nothing for the most recent day.
 */
export async function getTreasuryDay(date = null) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('treasury_day', { p_date: date });

  if (error) {
    throw new Error(`Could not load the treasury day: ${error.message}`);
  }

  return data;
}

// ---------------------------------------------------------------------------
// Staff and salaries (802, Al Hakeem first)
// ---------------------------------------------------------------------------

/**
 * Everyone on the staff list, active first, with their daily rates for the
 * owner (staff_rates is the owner's under RLS, so a staff login gets none and
 * `rates` comes back empty). Retired people are included only when asked for.
 */
export async function getStaffMembers({ includeRetired = false } = {}) {
  const supabase = await createClient();
  let query = supabase
    .from('staff_members')
    .select('id, name, job, phone, is_active, rates:staff_rates(daily_rate, effective_from)');
  if (!includeRetired) query = query.eq('is_active', true);
  const rows = unwrap(await query, 'the staff list');
  return rows
    .map((row) => ({
      ...row,
      rates: [...(row.rates ?? [])].sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1)),
    }))
    .sort(
      (a, b) => Number(b.is_active) - Number(a.is_active) || a.name.localeCompare(b.name, 'en'),
    );
}

/** The register for one day: { staff_id: 'present' | 'half' | 'absent' }. */
export async function getAttendanceForDay(date) {
  const supabase = await createClient();
  const rows = unwrap(
    await supabase.from('staff_attendance').select('staff_id, status').eq('work_date', date),
    'the attendance',
  );
  return Object.fromEntries(rows.map((row) => [row.staff_id, row.status]));
}

/** The Salaries table for the month holding `monthStart` (YYYY-MM-01), summed in Postgres. */
export async function getSalaryMonth(monthStart) {
  const supabase = await createClient();
  return unwrap(await supabase.rpc('get_salary_month', { p_month: monthStart }), 'the salaries');
}
