# Changelog

A narrative history of what has been built and why, for a new session to
read instead of re-deriving context from the diff alone. Entries are
grouped by theme and roughly chronological within each group. Full detail
for any of these lives in the actual commit messages (`git log`) — this is
the summary, not a replacement for them.

For the underlying business rules (roles, what the database enforces, how
stock is calculated) see `README.md`. For the reusable patterns these
entries establish (dialogs, table layout, buttons) see
`docs/UI_CONVENTIONS.md`.

## Where things stand

A short orientation, so a new session does not have to read the whole file to
know what the app is today. Everything below this section is the narrative, in
theme order; the last block of work is at the bottom.

**The shape of it.** Next.js App Router (plain JavaScript) on Vercel in
`sin1`, Supabase Postgres in `ap-southeast-1`. One owner, a couple of staff
logins, one pump. Migrations run to **072**, and every page wears the new look
(September 2026).

**What was added most recently**, newest last, all of it detailed further down:

| Area             | What changed                                                                                                                                                                                                                                                                                                                                                            |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loose oil        | A drum bought from a supplier and sold by the rupee, not the litre. Its own page under Lubricants, litres derived server-side from a rate, sale litres widened to 3 dp. Migrations 028–030.                                                                                                                                                                             |
| Tables that grow | `<Pager>` on Purchases, Banking, Stock checks, the customer ledger and both sales tables — and the removal of `.limit()` caps that were silently truncating a money total.                                                                                                                                                                                              |
| Dashboard        | An oil-sales chart beside the fuel ones (`get_lubricant_trend`, 029).                                                                                                                                                                                                                                                                                                   |
| Customers        | Removing one (delete if never traded, retire if it did), deleting one for good, an opening balance created with the account, and editable details. Migrations 031, 033, 034.                                                                                                                                                                                            |
| Money precision  | The ledger moved to **whole rupees**, storage as well as display — there is no coin below one rupee. Migration 032.                                                                                                                                                                                                                                                     |
| Speed            | Functions moved to Singapore beside the database; the Guide is prefetched.                                                                                                                                                                                                                                                                                              |
| Feedback         | Every destructive submit shows a pending state; delete triggers are a trash icon.                                                                                                                                                                                                                                                                                       |
| Guide            | Location chips, bold rule titles and a folded setup section — a fifth shorter than before, and scannable.                                                                                                                                                                                                                                                               |
| Settings         | The rate panel previews five changes (rounded up to a whole date) instead of seven days, so it no longer scrolls inside itself.                                                                                                                                                                                                                                         |
| Dashboard        | The charts take a 7 / 14 / 30 / 90-day window (`<TrendRange>`), carried through the day arrows by `<DateNav extraParams>`.                                                                                                                                                                                                                                              |
| Dashboard        | The fuel-sales chart toggles Rupees / Litres, split by fuel, so it no longer duplicates the cash-vs-credit chart beside it.                                                                                                                                                                                                                                             |
| All fuel rates   | Eight rows a page instead of 25, and the 70vh height cap dropped, so nothing scrolls inside the card.                                                                                                                                                                                                                                                                   |
| Activity         | An audit trail: a trigger on sixteen tables writes who changed what into an append-only `activity_log`, read at `/admin/activity` by the owner. Migration 035.                                                                                                                                                                                                          |
| Lubricants       | Packed and loose sales merged into one filtered table (the drum's route is now a redirect), the day's totals split and labelled, low-stock badges, and the Urdu register words بنام / جمع on the balance cards.                                                                                                                                                         |
| Company Assets   | A new owner-only page for what the pump has bought and kept — vehicles, machinery, property, electronics. Card grid, icon-tile category picker, figures from a summary RPC. Migration 036.                                                                                                                                                                              |
| Readings         | A warning naming the missing day, and a checkbox that must be ticked to save a reading when the day before it was never entered. A day-completion strip was tried three ways alongside it and removed — migrations 037 and 038 add and then drop its RPC.                                                                                                               |
| Stock            | **A dip taken in the morning closes yesterday.** The maths assumed the opposite and reported a whole day's sales as a loss, every day. `taken` + generated `books_date`; `expected_stock` recalculated from history rather than frozen at insert; the dashboard's tank card stopped ignoring the date on screen; and the owner can clear a mistyped dip. Migration 039. |
| Treasury         | **The cash in the safe on site** — the owner's "Tajori" sheet, owner-only, seeded with his real 36 movements. A page is a DAY, not 25 rows, addressed by date and skipping days with nothing on them. The safe may never hold less than nothing, judged over the whole chain. Migrations 044–048. |
| Profit           | **It was counting stock BOUGHT, not stock SOLD.** August 2026 showed a Rs 1,464,581 loss for a month that made Rs 566,307, because 10,000 L of petrol arrived six days before month end. Now `sales − cost of goods sold − expenses`, with stock valued at the cost of the deliveries it is made of. One function, all three reporting RPCs. Migration 049. |
| Activity         | The owner may clear the OLD end of the log — whole retention periods only, cutoff computed in Postgres, recent month never touched, the trim logged into the log it trimmed. Append-only intact: no line editable, no single line removable. Migration 050. And the open section in the sidebar now ends with a dark bar, because the tint alone washes out in daylight. |
| Backups          | **The books can now leave Supabase and come back.** Settings → Backup → Download backup writes the whole book as one JSON file; `scripts/restore-backup.mjs` loads it into a fresh project with the triggers off, remapping each entry's author onto the new logins, then recomputes counts and money totals and compares them against the file. Migration 051. |
| Readings         | **A reading would not save, and every figure on it was right.** 197.75 L × Rs 371.90 is exactly Rs 73,543.2250; Postgres rounds the half-paisa up, a JavaScript double rounds it down, and the balanced-day constraint refused the row by one paisa. The cash is now derived in the database. Migration 052. |
| Expenses         | **A partial reimbursement can be recorded against an expense** — a bill paid in full upfront, repaid a little at a time. Stored as a second row in the same shape, amount negative, same category, dated when the cash actually comes back. `expenses.amount` relaxed from `check (amount > 0)` to `check (amount <> 0)`; no new table. Migration 053. Recording one moved to two dialogs, **Add expense** / **Add recovery**, plus a third "Recovered" stat tile. |
| Settings         | **Set a new rate** and each tank's capacity/opening stock moved behind dialogs; the two current-rate cards fill edge to edge in the fuel's own colour (`solid`, the same blue/orange Readings and Stock wear) at `text-4xl`+, and each tank card now shows its live book stock plus a **last dipped** line (`getLastStockCheck`) so the book figure and the last physical check against it sit side by side. |
| Dashboard        | **Total sold this month** — petrol and diesel litres for the calendar month shown, up to the day on screen. `get_daily_summary()` gains `month_by_fuel_type` (054 shipped this as a lifetime total first, corrected to month-to-date by 055); always rendered, even on a day with nothing entered yet. "By fuel type" now names the day it is for, the same fix. |
| Customers        | **The ledger's Balance column was counting from zero on every page** — page 1 showed Rs −59,728 against the newest entry of a customer who owed Rs 97,515. The running balance is a window function in Postgres now, over the whole ledger, with the page taken afterwards. Migration 064. |
| Customers        | **The statement of account became balance-forward**: every fill and every payment with the balance after each, instead of only the unpaid fills with an oldest-first "paid off" figure that appeared nowhere in the ledger. Same five columns as the transaction history, so the two can be read against each other. |
| Customers        | **The statement's period became a date range** (From / To, either end blank for no limit) instead of a number of days back from today. A period ending in the past closes with **"Balance as at 31 Aug 2026"** rather than "Total now due" — entries since that date are real and are not on the sheet. |
| Dashboard        | **Regrouped into three zones** — Fuel, Lubricants, Trends — instead of five same-weight `.section-heading`s in a row, on the complaint "too much numbers on one page." Hierarchy by size only (never by shrinking to a caption style — `.section-heading`'s own comment already records why that was tried once and reverted). |
| Dashboard        | **A complete new look — the first page in it; the rest of the site is to follow.** New surfaces (`.panel`), icon tiles, sentence-case captions, a day header that is the page's h1, headline cards with the trend along their bottom edge, ONE card per fuel with its tank drawn as a tank, gold-banded lubricant panels, redrawn charts. Same three queries, no database change. Rules in `UI_CONVENTIONS.md` → "The new look". On a branch until the owner has looked at it. |
| Readings         | **Moved to the new look.** Same queries, same entry dialog, same warnings and rules; new day header (Clear this day in its row), figure cards, unit panels, and no black surfaces. A money figure on the nozzle card is never truncated any more. |
| Stock            | **Moved to the new look.** Same queries and rules; the dip card keeps its loud fuel band and gains the tank gauge; the shelf says Low / Out of stock in words. The Dashboard and Readings redesigns were merged to `main` before this. |
| Every page       | **Moved to the new look**, the shell and its shared pieces first (`TitleHeader`, `SectionHeader`, `KpiCard`, `.panel`), then Purchases, Lubricants, Customers, Banking, Treasury, Expenses, Company Assets, Reports and its subpages, Activity, Settings, Your account and the Guide. The old look's components and classes are deleted. See "The rest of the site, in the new look". |
| Text             | **No em dash anywhere a person reads**, at the owner's request. Text the database writes (the activity log, its refusals) goes through `withoutDashes()` on the way to the screen. |
| Expenses         | A category that only got money back broke the breakdown (MUI's bar refused -1); it is listed apart, and its caption says **"Recovered this month"**, not a comparison that read as a claim about the whole month. |
| Banking          | **A main bank account**, marked by the owner, that the money in / money out form starts on. Migration 065, applied to the live database on 26 Sep 2026 with every account and transaction hashing identically before and after. |
| Layout           | **Cards side by side are one height** on every page. This reverses the `items-start` rule ("a short card stays short"); each card now chooses where its spare height goes. |
| Fuel rates       | **A price dated back to a day already entered re-prices that day's readings**, and says which days and by how much; removing a price does the same onto the one before it. Readings warns while a fuel's rate is carried over from an earlier day, and the saved-reading dialog shows the rate. Migration 066, applied to the live database on 28 Sep 2026, and used to put 26 and 27 Sep right (Rs 3,560.41), then 14 Aug, 25 Aug and 12 Sep (Rs 6,358.48). |
| Suppliers        | **An account for each supplier**: every delivery (posted by itself from Purchases), every payment (cash out of the safe or a transfer out of a bank account, in the same step), every discount and adjustment, and what the pump owes after each. Four placeholder suppliers at zero, renamed by the owner. Migration 067. |
| Stock value      | **The month's opening and closing stock, fuel by fuel, with the rate each is valued at**: litres, cost a litre, value at cost (the figure profit uses), the pump price and the value at it. On the Dashboard (last month's close = this month's opening) and on Reports (both ends of the chosen month). Migration 068, read only. |
| Stock value      | **Stock is valued at the lower of cost and the pump price** (IAS 2; Income Tax Ordinance 2001 s.35), so a price cut below cost is a loss in the month it happens. No past profit changed: at every month end so far the pump price was above cost. Migration 069. |
| Banking          | **Every bank entry is kept.** The 60-per-account cap (018) is removed; it was deleting HBL 2303's entries after about two and a half weeks. The page now pages in Postgres. Migration 070. |
| Customers        | **A new customer's opening balance saves.** It never had: 034 wrote the entry type as text into an enum column, so every opening amount was refused. Migration 071. |
| Security         | **Stock value and cost of sales were readable without logging in**, through three functions the public key could call. Closed, with seven internal helpers staff could call. Migration 072. |

**If you are porting this to Electron or another shell**, read
`README.md` → "If you are porting this off Supabase" first. The short version:
almost none of the important logic is in the JavaScript. Seventy-two
migrations of triggers and constraints hold the money rules, and the hardest
single thing to reproduce is the activity log (035) — one PL/pgSQL trigger on
eighteen tables that diffs `jsonb` and writes an English sentence. Decide
early whether a single-user offline build needs it at all.

**For the offline (Electron) build, which tracks this repo: what it still has
to take.** Read the section at the very bottom of this file, **"Syncing the
offline (Electron) build: reference `3d696ea` -> the end of migration 072"**.
It is the one checklist for everything since the desktop build last caught up
(its `PROGRESS.md`, "The third catch-up", stops at reference `3d696ea`, 24 Aug
2026): migrations 053 to 072 with what to do about each, the new look on every
page, the new pages and shared files, and the three migrations to skip. Anything
added to this repo after it should extend that section, so the next sync stays a
single read.

**Eight things that are load-bearing and easy to break:**

1. **The database enforces the money rules, not the app.** Balanced days,
   append-only ledger, no overlapping meter readings, stock recalculated from
   history. `README.md` → "What the database will not let you do" is the list.
   **Anything derived is recalculated, never written once** — tank stock and,
   since 039, a dip's `expected_stock`. A figure stored at insert and never
   revisited will be wrong the moment anything behind it is back-dated, and
   nothing on screen will say so.
2. **Whole rupees on the ledger, two decimals on the meter.** Different
   rounding for different reasons, and three places must agree — see
   `docs/UI_CONVENTIONS.md`.
3. **A dip is a moment, not a day.** It is checked against `books_date` —
   the trading day it _closes_ — not the day it was taken. This pump dips in
   the morning, so those differ by one. See `README.md` → "A dip belongs to the
   day it closes".
4. **The business day is `Asia/Karachi`**, never the server clock. The activity
   log is the one place a _time of day_ is shown, and it is pinned the same way
   — rendered on a UTC server without pinning, an evening entry prints as an
   afternoon one.
5. **`activity_log` is written only by trigger and can never be edited.** If a
   future change adds a table that holds money, attach the trigger to it in the
   same migration; if one is renamed, the log line degrades rather than
   breaking, so nothing will tell you.
6. **Profit subtracts the cost of stock SOLD, never stock BOUGHT** — since 049.
   `cost_of_goods_sold()` is the only place that arithmetic lives and all three
   reporting RPCs call it. Reimplementing `sales − purchases − expenses`
   anywhere reintroduces a bug that showed a Rs 1.46m loss in a profitable
   month, and it reads perfectly reasonable while doing it. Anything that
   derives a per-day or per-week profit has to spread the cost of goods sold,
   not the purchases. And since 059 there are TWO stock questions:
   `calculate_expected_stock()` is what the books say (a dip closing that day is
   excluded, so a gain/loss means something) and `tank_stock_on_hand()` is what
   the tank actually holds (that dip IS the answer). Valuation and profit ask the
   second. Asking the first charged every month-end's stock loss to the month
   after it.
7. **A nozzle has a service window, and the reading sheet asks about a DATE.**
   Since 056 a unit can be replaced in place: `is_active` says whether a nozzle
   is on the forecourt *today*, `commissioned_on`/`retired_on` say which days it
   was there at all, and `get_reading_sheet()` must filter on the window — using
   `is_active` there would hide a replaced unit's own past days from correction.
   A unit number outlives the hardware wearing it, so anything grouping nozzles
   into units groups on unit number **and** `commissioned_on`. Since 058 the
   number is also EDITABLE and a position is guarded across all of history by a
   deferrable exclusion constraint — never re-implement that check in JavaScript,
   which does not have the windows and will refuse legitimate arrangements.
8. **A column added to a table the backup covers must be nullable.**
   `restore_everything()` (051) writes every column by name, so a backup taken
   before the column existed hands it null, and NOT NULL would refuse the whole
   file. Every column added since (056, 063, 065, 067) is nullable for this reason,
   and nothing fails until the day an old backup is needed.

## Foundation

- Next.js App Router app scaffolded: auth flow (Supabase, no public
  signup — accounts are created by the owner or by hand once), the daily
  reading entry screen, then purchases, stock checks, the customer ledger,
  dashboard, reports and settings.
- Postgres schema, RLS policies and reporting RPCs — see `README.md` →
  "Database migrations" and "What the database will not let you do" for
  the enforced rules (balanced days, append-only ledger, no meter running
  backwards, tank stock recalculated from history rather than
  incremented).
- The business day pinned to `Asia/Karachi` regardless of server clock —
  the app and the database were fixed to agree on "today" independently,
  since a Vercel server in UTC and a browser in Pakistan disagree between
  midnight and 5am otherwise.
- Early correctness fixes: readings form not submitting its closing value,
  payment status displaying a value the database never actually saved,
  a nested-aggregate bug in the Excel export RPC.
- Monthly Excel export added, with native charts, built from
  `scripts/build-report-template.py` (openpyxl). **Sheets must be created
  last** in that script — the app addresses them by file name
  (`sheet1.xml`, …) and openpyxl numbers them in creation order, so
  inserting one anywhere but the end silently renumbers everything after
  it.

## Banking

- Bank accounts, deposits and payments added: each account tracks a
  running balance from an owner-entered opening balance.
- **No account may go below zero** — enforced by a database trigger, per
  account, not across the total.
- **A payment larger than one account can be split across several** —
  the owner ticks which accounts cover the rest, drawn down in the order
  ticked. Written as one Postgres RPC (`record_bank_payment()`) rather
  than a loop of inserts in the app, because several rows that are really
  one payment must land together or not at all, and only the database can
  promise that. The split shown while typing is computed client-side only
  to preview it — the real allocation is computed by the RPC from live
  balances, never trusted from what the browser posted.
- Bank transaction confirmation moved from a message left sitting in the
  form to a `<Toast>` — a success message is only worth reading once, and
  one left in the form is still there, describing something unrelated,
  by the time the next transaction is typed.
- "Add a bank account" moved from a form permanently open on the page into
  a `<Dialog>` — the first use of what became the dialog-form pattern
  documented in `docs/UI_CONVENTIONS.md`. Reasoning: an account is added
  twice, ever; a transaction is recorded every week. The permanent
  four-field form for the rare job was crowding out the frequent one.
- 60-transaction-per-account retention: older rows are pruned
  automatically, but the **balance is never wrong** — each pruned amount
  folds into `pruned_deposits` / `pruned_payments` on the account before
  the row goes. What's lost is itemised history; the monthly Excel export
  is the durable backup for that detail, not a convenience copy.

## Branding

- Business name and logo made data-driven: `BUSINESS_NAME` in
  `app/_lib/brand.js`, logo at `public/logo.png` (falls back to an
  initials tile if absent). Renamed to "Mubeen Petroleum Service".
- Browser tab icon (favicon) generated from the logo through several
  iterations: first attempts left it unreadable at 16px or cropped on a
  non-square canvas; settled on isolating just the flower mark (the full
  lockup doesn't read at favicon size), squaring the canvas, and packing a
  real multi-size `.ico` rather than a single PNG masquerading as one.

## Settings, Account and navigation restructuring

A connected sequence of changes reorganizing where things live, driven by
"how often is this looked at vs. how often is it acted on":

1. **Nozzle wiring and staff-login creation moved behind dialogs** on the
   Settings page, same reasoning as the bank account dialog: both are
   forms for a job done once when the pump is set up and almost never
   again, and were sitting open on the page as if they were daily work.
   The nozzle dialog uses `<Dialog size="lg">` (a new prop added for this)
   since its six-row table needs more than the default 32rem.
2. **Staff logins moved from Settings to the Account page** — Settings is
   prices and hardware; Account is where an owner already looks at their
   own login, and reads everyone else's in the same glance far more often
   than as a separate tab click away. Owner-only, same as before.
3. **Account itself moved out of the tab row**, next to Sign out instead —
   it was never a working section the way Readings/Purchases/etc. are;
   nobody finishes a nozzle reading and reaches for Account next. Grouped
   with Sign out under "about you" rather than "a section of the app".
4. **Change password collapsed behind a click** on the Account page
   (closed by default, CSS grid-rows `0fr → 1fr` animation, no
   ResizeObserver needed) — three password boxes standing open by default
   read as an unfinished task rather than an available option. Stays open
   after a successful change so the confirmation is readable.
5. **Nav tabs split into two visually separated groups** — the six worked
   in all day (Dashboard–Banking) left-packed with breathing room, Reports
   and Settings (checked occasionally) pinned to the far right via
   `ml-auto`. An intermediate version made every tab share the row equally
   before landing on this grouped layout. Below `lg` there's no spare
   width for any of this and it falls back to natural left-to-right order.
6. **Account page gained a two-column layout at `lg`+**
   (`grid-cols-[22rem_1fr]`, the same split Settings' fuel-price section
   uses) so Staff logins fills the space beside the owner's own account
   card instead of sitting empty below it. Single column on narrower
   screens, same order as before (own account, then Staff logins).

## Purchases page

- **Table width vs. form width conflict.** The Purchases table has seven
  columns (adds a delete action for the owner) and needs close to 850px to
  render without cramping, more than any other table in the app — but it
  shared a `22rem_1fr` grid with the delivery form, leaving only ~740px
  and forcing an internal horizontal scrollbar.
  - First fix attempted: shrink padding and column minimums to force the
    table into the available space. **Rejected after a screenshot** (not
    just a `hasScroll` measurement) showed the Supplier column wrapping a
    real name across three lines — the scrollbar symptom went away, but a
    worse regression replaced it. This is the canonical example, referenced
    in `docs/UI_CONVENTIONS.md`, of why a layout fix must be verified with
    a screenshot and realistic data, not a boolean alone.
  - Second attempt: a `position:relative; left:50%; transform` "breakout"
    to widen just this page past the shared `max-w-6xl` cap. Worked above
    ~1280px viewport width, but leaked a page-level horizontal scrollbar at
    common laptop widths (1024–1152px) — abandoned as too fragile.
  - Landed fix: stack the form above the table (later: behind a dialog —
    see below) instead of beside it, so the table gets the page's full
    ~1120px width with room to spare. Verified with Playwright screenshots
    from 1024px to 1920px: no internal scrollbar, no page-level overflow,
    no cramped text.
- **"Record a delivery" moved into a `<Dialog>`**, following
  `docs/UI_CONVENTIONS.md`'s dialog pattern exactly (same close-on-success
  effect and Toast as `BankAccountForm`). The intermediate "form stacked
  above the table" state left its own `max-w-md` column mostly empty
  whitespace once the table below filled the page — putting the form
  behind a button in the page header, like every other rarely-used setup
  form in this app, uses that space properly instead of just relocating
  the emptiness.
- **Sign out button** given `.btn-danger` styling (red, matching the
  Account button's size) to read as a distinct, deliberate action rather
  than blending in with neighbouring buttons.

## Date navigation, rates and deliveries

- **The date box navigates on pick; the Go button is gone.** Choosing a date
  IS the instruction - having to press something else afterwards was a step
  people forgot. Lives in `DateJump.js` because it needs to be a Client
  Component; the rest of `DateNav` stays on the server. Two details worth
  keeping: a native date box fires `change` while the year is still being
  typed (0006-08-06 on the way to 2026-08-06), so only a complete, plausible
  date navigates; and clicking anywhere on the box opens the calendar via
  `showPicker()`, rather than only the small icon at its right edge.
- **Per-litre rates show their paisa.** `formatPKR` rounds to whole rupees,
  which turned a Rs 339.48 pump price into "Rs 339" on Settings, Purchases
  and the readings rows. `formatRate` in the new `app/_lib/format-helpers.js`
  handles anything per-litre - see `docs/UI_CONVENTIONS.md`.
- **A fuel rate can be removed.** A fuel and a date carry one rate, enforced
  by a unique constraint, so a mistyped rate could not be corrected by saving
  again over the top - the wrong price simply stood for the whole day. Note
  what removing one does NOT do: readings already saved keep the rate they
  were sold at (a copy lives on the reading row), so those days still have to
  be cleared and re-entered. The confirmation says so.
- **Nozzle wiring saves once, not six times.** Describing how the pump is
  plumbed is one job done once in its life, so the dialog now has one Save
  rather than a button per row. One button also means one write:
  `set_nozzle_wiring()` (migration 022) does all six in a single UPDATE,
  because six separate statements can fail after the third and leave half the
  nozzles pointing at the new tanks and half at the old - and `tank_id`
  decides which tank a sale draws down.
- **A delivery is recorded by its invoice total, not its rate per litre**
  (migration 023). The delivery note states litres and an amount payable;
  that amount is what leaves the bank and what profit is computed from, so it
  is the fact and the rate is arithmetic on it. `total_cost` and `rate` swapped
  roles in the schema - `total_cost` is now stored and `rate` generated from
  it. The old way could not represent an invoice exactly: `rate` was
  `numeric(10,2)`, so on a 20,000 litre load every storable total was a
  multiple of Rs 200, and an invoice of Rs 4,800,010 was silently kept as
  Rs 4,800,000. Existing rows converted exactly, since `total_cost` already
  held `round(litres x rate, 2)`.
  - The derived rate keeps 4 decimals in the database but is displayed to 2,
    so a table row can read 20,000 L at Rs 240.00 totalling Rs 4,800,010 -
    which does not multiply out. The total is the recorded figure; the rate is
    labelled as derived.

## Expenses became its own page

- **Expenses moved off the bottom of Reports to `/admin/expenses`**, with a
  nav tab of its own. Reasoning: Reports is read once a month, but an
  expense is written down the day it is paid — and reaching the form meant
  scrolling past the headline tiles, the closing-stock table, two charts
  and a day-by-day table first. The two jobs had opposite rhythms sharing
  one screen; only one of them was at the top.
- **The new page is filtered by month, and its table follows that filter.**
  On Reports the by-category card was the chosen month while the table
  below it was the last 50 expenses regardless of month, so the two
  disagreed and the category list could not be checked by reading down the
  table. `getExpenses()` now takes optional `from`/`to` dates and the page
  passes the month on screen to both, so total, breakdown and rows always
  describe the same set. Categories are listed biggest-first — the
  question the breakdown answers is which cost dominates the month.
- **The category totals are summed in the page, not by the report RPC.**
  `get_monthly_report()` computes sales, purchases, stock and profit for
  the whole month; calling it just to get expenses grouped by category
  would be most of a monthly report's work for one small list. The page
  already has the month's rows in hand and reduces over them.
- **The form stays open on the page rather than going behind a dialog** —
  the exception to the rule in `docs/UI_CONVENTIONS.md`, and deliberately.
  A dialog is for what is set up once (an account, a tank); recording an
  expense is the reason this page is opened at all, and the four-column
  table beside it fits the `1fr` track with room to spare. Verified at
  1024/1152/1440px and 400px: no page-level sideways scroll, table
  scrolling inside its own card on a phone as usual.
- **Reports keeps the Expenses total**, since profit is computed from it,
  and the tile now carries a link through to the new page for the month on
  screen. Removing the figure entirely would have left profit with a term
  that appears nowhere on the page.
- **Expenses sits with Banking in the nav, not beside Reports** — both are
  money the owner alone sees, and both are written to as routine work.
  Reports and Settings keep the far-right `edge` group to themselves.

## Lubricants

- **A lubricant shelf was added as its own trade**, not as a third
  `fuel_type`. Petrol and diesel live in two fixed tanks and are sold
  through metered nozzles, so a day's sale is _derived_ from meter
  readings; oil is a changing list of products sold one tin at a time, so
  a sale is _typed_ as a sale. Reusing the fuel machinery would have meant
  inventing a nozzle per brand and editing an enum every time the owner
  switched supplier. Three tables instead: `lubricants` (the products),
  `lubricant_purchases` (restocking) and `lubricant_sales` (the counter).
- **Everything is measured in litres, packs and loose oil alike.** A pump
  that sells sealed 4 L cartons _and_ 250 ml poured from an open drum is
  selling the same stock either way, and one unit is what keeps the stock
  figure honest across both. The product's `pack_size_litres` is therefore
  only a shortcut on the sale form — a button that fills the litres box —
  never a separate kind of entry. Quick amounts of 0.25 / 0.5 / 1 L sit
  beside it for the loose pours that actually happen.
- **The amount is typed and the rate per litre is generated**, the same
  swap migration 023 made for fuel deliveries. It is what lets a 4 L
  carton at Rs 4,500 and a quarter litre at Rs 400 both be recorded
  without anyone dividing by hand — and those two do not imply the same
  rate, which is exactly why the rate could not be the input. The sale
  form prefills the amount from the product's rate and then leaves it
  alone once touched: a carton is usually priced below the sum of its
  litres, and a prefill that overwrote a typed figure would be worse than
  none.
- **Credit goes on the same customer ledger as fuel.** A new
  `ledger_entries.lubricant_sale_id` mirrors `credit_sale_id` — unique, so
  a sale cannot post twice, `on delete set null` so removing a sale
  releases the reference rather than taking the debt with it. The
  append-only trigger gained the column as a third narrow exception, on
  the same terms as the other two. Deleting a sale posts the offsetting
  credit _before_ the delete, in one transaction, exactly as
  `delete_reading` does.
- **`fuel_type` is left null on a lubricant debit.** The ledger's own
  check constraint allows it on a debit, and it keeps the customer
  statement's petrol/diesel breakdown describing only fuel while the
  balance still counts everything. The note on the entry carries the
  product name instead.
- **Removing a product means one of two things and the database decides.**
  Never bought and never sold: deleted, since there is nothing to
  preserve. Traded at any point: retired, because deleting it would tear a
  hole in months already reported and exported. `delete_lubricant()`
  returns which of the two happened so the screen can say so rather than
  leaving the owner guessing. The unique index on the name is partial
  (`where is_active`), so retiring a brand releases its name for a
  replacement — which is the thing the owner actually asked for.
- **Purchases became one list rather than two.** Fuel and lubricants are
  different deliveries from different suppliers, but at month end they are
  one question — what went out on stock and how much is still owed — so
  they share a table with an Item column and a colour-coded badge.
  `deletePurchase` and `setPurchasePaymentStatus` take a `kind` field to
  know which table the row came from; it defaults to fuel, so nothing that
  does not send it changed behaviour.
- **Profit now counts both trades**: `fuel sales + lubricant sales − fuel
bought − lubricants bought − expenses`. A pump selling Rs 200,000 of oil
  a month and reporting none of it is not reporting its profit, so this is
  a correction rather than an addition. The cash-basis caveat is unchanged
  and now covers both, which is why closing stock is reported for the
  shelf as well as the tanks.
- **The charts stayed fuel-only and were relabelled to say so.** Oil is a
  rounding error next to fuel by value, so a stacked lubricant series
  would have been an invisible sliver that cost the chart its legend-free
  simplicity. The day-by-day table carries a Lubricants column instead,
  where the figure can actually be read.
- **`get_sales_trend` had to be dropped and recreated**, not replaced —
  Postgres will not change a set-returning function's output columns in
  place. Its per-day figures now come from lateral aggregates rather than
  one group-by: joining lubricant sales onto the same rows as nozzle
  readings would have multiplied each against the other.
- **The workbook gained a `Lubricants` sheet and two Daily columns.** The
  sheet was created last in `build-report-template.py`, as the file's own
  warning demands, so nothing was renumbered; the Daily columns went on
  the end, after everything the three charts point at by fixed range.
  Lubricant purchases are folded into the existing Purchases sheet so the
  workbook matches the screen. Verified by regenerating the template,
  building a workbook from sample data and reopening it: nine sheets,
  three native charts intact, `Daily!E2:E32` still the sales range.
- **`clear_day` was deliberately left alone.** It exists for the one
  mistake that cannot be unpicked row by row — a whole day of meters
  entered against the wrong date — while deliveries, expenses and now
  lubricant sales are each deleted on their own screen where you can see
  what you are removing. A counter sale is one row, so it belongs in that
  second group. `reset_all_data` _does_ clear the trading, and keeps the
  product list with its stock zeroed, on the same reasoning that keeps the
  tanks.

### Lubricants: two layout fixes after first use

- **The Lubricants header jumped a row when the date changed.** Its
  `<DateNav>` carried both page actions as children, and "Back to today"
  only renders when the date is not today — so today fit on one line with
  the title and yesterday wrapped underneath it. Stepping back a day moved
  every control. The date controls and the actions now share a row of their
  own below the header, which cannot wrap against the title at all.
  Screenshotted at 1440/1152/1024 and 400px on both today and an older
  date: identical placement in every pair, no page-level sideways scroll.
- **A lubricant's name sat under its badge in the Purchases table**, which
  made those rows taller than the fuel rows around them and left the brand
  looking secondary — when the brand is the whole content of that cell for
  a lubricant. Badge and name are inline now, with a `min-w-[13rem]` on the
  cell so an ordinary name ("Carient 20W-50") stays on one line at 1024px.
  A very long name still wraps, deliberately: forcing it onto one line
  would put a horizontal scrollbar on the table at laptop widths, which is
  the worse trade and one this repo has already made once.
- **Readings got the same header treatment**, on the same reasoning rather
  than because it had visibly broken: it carries "Clear this day" beside
  the same conditional "Back to today", so it was one wide button or one
  narrow screen away from the identical jump. It is also the screen worked
  through every evening, which makes it the last place a control should
  move between one day and the next. Checked as owner and as staff, on
  today and an older date, at 1440/1152/1024 and 400px.

### A readability pass, for an owner moving off a spreadsheet

The app was built text-first and measured badly for the person who actually
uses it — an owner in his fifties reading a tablet in a pump office. Measured
before the change, on the Readings screen: nozzle figures 14px, their
captions **10.4px** uppercase grey at 4.76:1, table cells 14px, nav 14px —
while the page heading that tells the reader nothing was 24px. The data was
smaller than the chrome around it.

What changed:

- **Type scale**, mostly through `globals.css` so it stays fixable in one
  place: body and table cells to 16px, nozzle figures to 18px, stat values to
  24px, captions to a 12px floor, buttons and tabs to `py-3` (~48px targets).
- **`figure-label` / `figure-value`** — the caption-over-figure pairing that
  had been hand-rolled at 25 sites and had drifted to 10.4px in the worst of
  them, now one class each.
- **Contrast floor of `ink-600`** for anything meant to be read; `ink-400`
  (2.6:1) is now only disabled and placeholder text. 57 secondary captions
  and 10 "(optional)" hints moved up.
- **Icons** (`ui/Icon.js`), drawn inline rather than added as a dependency —
  on every nav tab, and on the Entered/Enter status, which had been two words
  two letters apart distinguished mainly by amber vs green.
- **The written date is now the loudest thing in `DateNav`.** A native date
  box is drawn in the _browser's_ locale, so on an en-US browser the 7th of
  August renders "08/07/2026" — the 8th of July to anyone reading day-first.
  Markup cannot change that, so the box was demoted to a jump control and the
  spelled-out date carries which day is on screen.

Two things this pass broke and then fixed, both worth knowing about:

- **The nav no longer fits on one line and now wraps.** Icons plus 16px
  labels need 1347px against a 1152px container, so Reports and Settings sat
  off the right edge on every laptop. The `lg:ml-auto` pinning that used to
  hold those two apart had to go with it: inside a wrapping row it threw them
  onto a line of their own, making the header three rows at 1024px. They are
  still last in reading order. Below `sm` the row still scrolls rather than
  wrapping — ten tabs stacked four deep would push the day's work off screen
  — and now has a measured fade on whichever edge still has tabs behind it.
- **"Rs 336.34 / litre" started truncating** in a nozzle row on a phone at
  the larger size. Fixed by moving "/ litre" into the caption rather than by
  shrinking the figure back down. Same story on the dashboard tiles, where
  "Rs 4,386,211" was breaking after the "Rs": those are `whitespace-nowrap`
  now, and the grid drops to one column below 380px so the number has room..

Checked by rendering a full six-nozzle sheet with realistic figures at 1440,
1152, 1024, 820, 400, 360 and 320px, scripted to report any element whose
text is clipped by its own box: nothing is, at any width, apart from the
`sr-only` "Actions" heading and the navbar's business name, both of which
truncate by design.

### Navigation moved to a sidebar, and the dashboard tidied

The top tab row had become the weakest part of the app: ten sections that,
once they carried icons and readable labels, needed about 1350px against a
1152px page. It had already been forced to wrap onto two rows, which ate the
top of every screen and still looked like a compromise.

- **`AdminSidebar` replaces `AdminNavbar`.** A fixed 240px column from `lg`
  up; below that a burger opening a drawer. All ten sections are visible at
  once either way, each with a full-width band to hit rather than a word.
  Account and Sign out sit at the bottom, apart from the sections.
- **The drawer is a native `<dialog>` opened with `showModal()`** — focus
  trapping, Escape and an inert page behind it come from the browser. It
  closes when the pathname changes rather than on the click, so it does not
  pull away while the next page is still loading.
- **The dashboard** picked up what the readability pass had missed: section
  headings and card titles were still `text-sm`, the three-up figure blocks
  inside the fuel, tank and lubricant cards were still 12px with `ink-500`
  captions. Those now use `figure-label` like everywhere else. Its date
  controls also moved to their own row, as on Readings, Lubricants and Stock.

Two consequences worth knowing about:

- **The Purchases table now scrolls inside its card at 1024px.** 240px of
  sidebar is 240px the content does not have, and that table needs 896px for
  its eight columns. It scrolls in the card rather than moving the page, and
  it already behaved this way on anything narrower. That is the trade for a
  nav that is always visible.
- **Viewport breakpoints stopped meaning content width.** At a 1024px window
  a page now has ~768px, so `lg:grid-cols-4` on the stat tiles gave each one
  192px and the big figures ran into their dividers. `StatGrid` measures
  itself with `@container` instead. While fixing it, the three hand-rolled
  copies of that strip (Readings, Lubricants, Customers) were replaced with
  the shared component — all three had the same latent bug.

The pump's own name was also being truncated to "Mubeen Petr..." in the
240px column. In the sidebar the logo, name and person now stack, each with
the full width; the phone's top bar keeps the inline, truncating layout,
where wrapping would push the day's work further down.

### Fuel rates: seven days on Settings, the rest on their own page

The rate moves most days and both fuels change together, so that table grew
by about sixty rows a month. Left unbounded it had become the tallest thing
on Settings and the part of the page nobody read.

- Settings shows the last **seven days** of changes and links to the rest.
  Counted in days rather than rows on purpose: a row limit cuts a day in
  half and shows diesel's new rate without petrol's, and the two are read as
  a pair.
- `/admin/settings/fuel-prices` is the full history, 25 to a page, newest
  first. The page number is a query string so Back works through it and a
  page can be linked to. Paged rather than capped, because an old rate is
  what a disputed reading gets checked against — there is no date past which
  it stops mattering.
- The table itself moved into `FuelPriceTable` and is shared by both. Its
  rows carry a delete confirmation that names the rate and the date, and
  that sentence drifting between two copies is how someone removes a rate
  they meant to keep.

### getSessionProfile is deduped per request

Every admin navigation was paying for the session lookup twice — the layout
asks who is signed in to draw the sidebar, then the page asks again through
`requirePageRole()`. Each ask is a claims check plus a select on `profiles`,
so two round trips to Supabase completed before a page began fetching what it
actually wanted to show. It is wrapped in React's `cache()` now, so the second
caller gets the first one's answer.

Worth being precise about what this is **not**: it is a per-request memo, not
a cache across requests, and it cannot serve a stale answer. A new request
does the lookup again — which is what keeps a deactivated staff account
locked out on their very next navigation.

### The middleware stopped calling Supabase on every request

`proxy.js` ran `supabase.auth.getClaims()` on every request the app served.
Measured with a mocked fetch against a valid, unexpired session cookie:

    getSession()  -> signed in: true | network calls: 0
    getClaims()   -> sub: 1111...  | network calls: 1  (/auth/v1/user)

So every navigation, and every prefetch, waited on a Supabase round trip
before Next.js began rendering. Both key types pay it, for different reasons:
on the legacy shared JWT secret the middleware cannot check an HS256
signature itself and auth-js falls back to `/auth/v1/user`; on asymmetric
signing keys it verifies locally but needs the JWKS, and that cache lives on
the client _instance_ — middleware builds a fresh client per request, so it
refetches `/.well-known/jwks.json` instead.

It uses `getSession()` now, which reads the cookie and only talks to Supabase
when the token is inside the refresh margin. Verified that the refresh — the
middleware's other job, and the reason Server Components can rely on the
cookie being current — still happens:

    token valid for another hour:  network: none        cookies rewritten: false
    token 10s from expiry:         network: /auth/v1/token  cookies rewritten: true

**Why dropping verification here is safe.** This gate decides one thing:
whether to redirect to the login page. It is not what protects the data and
never was. A forged cookie that gets past it reaches a page calling
`requirePageRole()`, which uses `getClaims()` and does verify, and behind that
every query runs under RLS. The worst it buys is being redirected to login a
moment later. Note the code reads `data.session` and never `session.user` —
auth-js wraps that user object in a proxy that warns on property access,
precisely because it comes from an unverified token.

Together with the `cache()` on `getSessionProfile`, an admin navigation went
from four Supabase round trips before its own data (middleware verify, then
the layout's claims + profile, then the page's claims + profile) to one
claims verification and one profile read.

### Daily sales got its own paged page, and section headings got their spacing back

- **`/admin/reports/daily`** shows every day the pump has traded, newest
  first, 25 days to a page. Reports keeps the same table collapsed under
  "Show these days as a table" for the month on screen and links across.
  The table moved into `DailySalesTable` so the two cannot drift apart.
- **Paged by date window, not by row.** `get_sales_trend` fills in every day
  between two bounds, including days with no trade, so a page is 25 _days_:
  page 1 is the last 25, page 2 the 25 before that. There is no row count to
  fetch — the page count falls out of the distance between the first trading
  day and today, which is what `getFirstTradingDay()` is for. Days with
  nothing entered show as zero rather than being skipped, so a gap in the
  book is visible instead of silently closing up.
- **`.section-heading`** replaces the hand-written heading classes. They had
  drifted: nineteen of them, nine with a top margin and ten without, so
  "Previous checks" on the Stock page sat flush against the card above it.
  `first:mt-0` in the class covers the headings that open a column or a
  section, which genuinely want no gap — so one class is correct in both
  places and cannot drift again.

### A Guide section, in English and Urdu

New nav entry and route (`/admin/guide`), open to **staff as well as the
owner** — the person most likely to need it is a new attendant on their first
evening, not the man who commissioned the app. It does not hide the
owner-only sections either; it labels them, because knowing Reports exists
and is not yours to open beats not knowing.

It is written for someone who has run this pump on paper for years and has
never opened the app: what to do, in the order you do it, naming the real
buttons. Contents: the whole app as three stages (set up once → enter the day
every evening → read the report monthly), the one-time setup in dependency
order, the evening routine as six numbered steps, a card per section saying
when you would open it, the rules the database enforces and what a refused
save means, how to fix a day entered against the wrong date, and who can see
what.

- **Both languages come from one source.** `_lib/guide-content.js` holds the
  text against the same keys in `en` and `ur`; the page renders that shape
  once. Two hand-written pages would drift the first time one was corrected.
- **The language is a query string** (`?lang=ur`), like the month filters —
  so the Urdu guide is a link that can be sent to someone and opens in Urdu.
- **The diagrams are boxes and borders, not images**: sharp at any size, they
  re-flow on a phone, the text stays real text, and the same markup renders
  right-to-left without being redrawn. `GuideFlow.js` documents the rule that
  makes that work — nothing inside may hard-code a left or a right.

Checked both languages at 1152 and 400px: `dir` flips, the stage arrows point
the other way, the step numbers move to the right-hand side, and neither
language overflows the page.

### "Check" was showing on every nozzle of every past day

The red Check badge on a nozzle row was driven by:

    Boolean(row.later_date) || openingDoesNotMatchPreviousClosing

`later_date` only means "a reading exists on some later date", which is true
of every nozzle on every past day the moment entry continues. So opening any
earlier date painted Check on all six rows at once — and a warning that is
always on is a warning nobody reads, including on the row where it mattered.

Checked against the real 04 Aug 2026 sheet: all six nozzles flagged, and the
data was clean — every opening equalled the previous closing, and every
05 Aug opening equalled the 04 Aug closing. Except one: Unit 2 · Nozzle B has
no reading on 04 Aug, and 05 Aug opens at 18,967.53 where 03 Aug closed at
18,882.18. Entering 04 Aug there really would double-count.

A meter is continuous, so the chain is intact when each reading opens exactly
where the one before it closed. The badge now means one of three things:

1. this day's opening is not the previous day's closing;
2. this day is saved but the next reading does not open where this one closed
   — the two overlap or leave a hole;
3. this day is not saved and a later reading already exists, so saving here
   back-fills underneath it.

A later reading that opens exactly where this day closes is the chain
working, which is the case that used to shout. Re-run over the same six rows:
one flagged instead of six, and it is Unit 2 · Nozzle B.

The same false positive was in the dialog's `ReadingChainWarning`, which told
you "a reading already exists for 05 Aug" on days where 05 Aug continued from
this one perfectly. Narrowed the same way.

### Overlapping readings are now refused, not warned about

On 07 Aug 2026 a day's six readings were entered at 13:15 dated the 7th, and
the same meter figures were entered again at 17:35 dated the 6th. Nothing
removed the first set, so one movement of the meters became two days:

    06 Aug   1,677.82 L   Rs 577,260   entered 07 Aug 17:35-17:39
    07 Aug   1,677.78 L   Rs 577,245   entered 07 Aug 13:15-13:17

The dialog did warn at the time — "the reading already saved for 07 Aug opens
at the same place this day starts, so it already includes these litres" — and
the warning was correct. It was also ignorable, and it was sitting under six
red Check badges that were firing on every row of every past day.

Migration 026 makes it a rule in the database. Two readings for one nozzle
overlap when the later one starts before the earlier one finishes, and that
is now refused with a message naming the other date, the two figures and how
many litres would be duplicated — the message is the instruction, since
`describe()` passes database errors straight to the user.

**A gap is still allowed.** A later reading starting _after_ an earlier one
finished means litres are missing, not duplicated — a skipped day or a
replaced meter — and blocking it would trap someone with no way forward.
Those stay warnings, as they were. Only overlap, which cannot be honest, is
refused.

`ReadingForm` also disables Save and explains the clash while the closing
reading is still on screen. That is the courtesy layer; the trigger is the
rule.

Checked against live data before applying: exactly the six 06/07 Aug pairs
overlap and nothing else in the history does. The trigger was then exercised
against the real 06 Aug row inside a block that deliberately aborts, so the
attempt rolled back — it returned the intended message and no row changed.

### Meter decimals, and a warning that knows which day it is on

Two small things spotted in the entry dialog on the duplicated 06 Aug day.

- **`1,987,128.8` beside `1,987,279.95`.** The opening had dropped its
  trailing zero, so two figures that describe the same dial rendered at
  different widths in a tabular font. Meter readings now use a `meterFormat`
  fixed at two decimals; litres sold keep the ordinary format, being
  quantities rather than dial positions.
- **The overlap warning was written for a day not yet entered** — "saving
  here will count them twice" — and was showing on a day already saved, where
  there is nothing to save and the double count has already happened. It
  reads as a prediction about a button that is not on screen. A saved day now
  gets the true statement instead: "this day and 07 Aug 2026 both cover the
  same 151.15 litres … one of the two has to be cleared: whichever date the
  meter was not read on." The unentered wording also now says the save _will
  be refused_, which since migration 026 it will be.

A third case fell out of separating the two: a saved day whose next reading
starts _above_ where it closed is a gap, not an overlap, and now says so —
"05 Aug 2026 opens at 18,967.53 but this day closes at 18,900.00 … 67.53
litres are on neither day."

### The selected day is now unmissable, and back-filling under a skipped day is refused

**The day banner.** The owner lost track of which date he was entering, which
is how a day's readings ended up on 07 Aug instead of 06 Aug. The date had
been said three times on the same screen in three different formats — the
page description, the browser-drawn date box, and a small grey caption — none
of them dominant. `DateNav` now opens with one tinted banner above the
controls: the relative label, the weekday and the written date. The weekday
is the part that matters; it is checkable against the day someone has
actually lived, where a row of digits is not. Grey for a past day, amber for
a future one, green for today, and "Past day" now appears where previously an
ordinary past date carried no label at all. The descriptions on Readings,
Lubricants, Stock and the Dashboard no longer repeat the date.

**Migration 027.** Migration 026 refused readings that overlap the next one,
but left a gap: when the next reading opens exactly where this day starts,
the only figure 026 still accepted was the opening itself — a nought-litre
day. That is a lie rather than a duplicate: it records "nothing sold" for a
day that traded, with the litres sitting on the later date, and nothing flags
it afterwards. Now refused outright.

It is deliberately _not_ a ban on back-filling, because the honest repair
looks almost identical and is needed — Unit 2 · Nozzle B had no 04 Aug
reading and 05 Aug opened 85.35 L above where 03 Aug closed. The test is
whether the later reading **left room**:

    room = next reading's opening − this reading's opening
    room > 0    a genuine gap; this day may be entered, up to that figure
    room <= 0   the next day already covers this one; nothing to record

Both paths were exercised against the live database inside blocks that
deliberately abort, so both rolled back:

    back-fill under a skipped-ahead day  >> BLOCKED, naming the day to clear
    back-fill into a genuine 85.35 L gap >> ALLOWED, as it must be

### The nozzle rows had no room to breathe

Six cards at `space-y-2` with `px-4 py-3` padding and the figures only 8px
under the nozzle's name — the whole evening screen read as one dense block,
and the name of the nozzle ran into the numbers belonging to it.

- Gap between cards 8px → 12px, so each one is visibly its own thing.
- Card padding to `py-4` on a phone and `p-5` from `sm` up.
- The figures now sit under a hairline with 12px either side of it, the same
  separation the dashboard cards use. A row carries two different kinds of
  thing — which nozzle this is, and what it did — and they were running
  together.

Structure is untouched: still one row per nozzle opening a dialog, still a
labelled figure per number. Those were deliberate and are documented; only
the spacing changed. Rendered with a full six-nozzle sheet — entered rows,
unentered rows, one with no rate — at 1440/1152/1024 and 400px.

### Nozzles grouped under their unit

A unit is a physical thing standing on the forecourt with two nozzles on it,
and the flat list gave no sign of that. Six evenly spaced cards read as six
unrelated pumps — "Unit 1 · Nozzle A" and "Unit 1 · Nozzle B" only announced
their relationship in words the reader had to compare.

- The sheet is grouped by unit, with a **Unit N** heading and a
  **"1 of 2 entered"** badge that turns green when the unit is finished, so a
  done pump can be skipped without reading both its rows.
- 32px between units, 12px between the nozzles inside one. The spacing does
  the grouping; the heading only names it.
- The card title drops to **"Nozzle A"**, since the unit is stated right
  above it. The DIALOG keeps the full "Unit 1 · Nozzle A" — it opens over the
  whole page with the heading out of sight, and it is the one place where
  being sure which nozzle you are typing into actually matters.

`get_reading_sheet` already returns rows ordered by unit then nozzle, so the
grouping walks that order rather than sorting again — a unit's nozzles are
adjacent by construction.

Unexpected benefit on a phone: dropping "Unit 1 · " freed enough width that
the fuel badge and the Entered/Enter status now sit on one line with the
name, where before the badge wrapped underneath.

### Docs caught up with the code

An audit of every markdown file after the last few sessions. What had gone
stale:

- **README's migration table stopped at 025.** 026 (readings may not overlap)
  and 027 (no back-fill where the next reading left no room) were applied and
  committed but not listed.
- **README's rules section had 026 but not 027**, and said nothing about the
  consequence that matters daily: enter days oldest first, and if one is
  missed, clear everything after it and re-enter forwards.
- **README's project layout** was missing `reports/daily/` and
  `settings/fuel-prices/`.
- **`public/README.md` still described a navbar** and a 36px logo. It is a
  sidebar now, and the mark is drawn at 64px on login, 48px in the sidebar,
  40px in the phone's top bar.
- **UI_CONVENTIONS' size-override example** pointed at "the compact navbar
  buttons", which no longer exist — the technique does, on the staff list, so
  the example moved there rather than being deleted.
- Added the **grouping principle** to UI_CONVENTIONS: let the gap carry the
  grouping, drop the repetition it makes redundant, and shorten a label only
  where the context replacing it is on screen.

`CLAUDE.md` needed nothing — its pointers to the three docs, the devcheck
route, the Playwright path and `npm run build` are all still accurate.

### Dialogs no longer close on a click outside

The owner reported a form vanishing when a drag that started inside the
panel ended just outside it. The cause is not obvious from reading the
handler: a `click` event is dispatched on the nearest common ancestor of
`mousedown` and `mouseup`, so pressing inside a text field and releasing a
few pixels past the panel edge fires `click` with `event.target` set to the
`<dialog>` element itself — indistinguishable from a real backdrop click.
The half-typed entry went with it.

Backdrop-close was removed from `ui/Dialog.js` outright rather than made
drag-aware by tracking the `mousedown` target. Every dialog in this app is
a form holding data someone is part-way through typing, the ways out are
already obvious (Escape, the header `✕`, a Cancel button on each form), and
nothing here benefits from dismiss-by-tapping-away enough to justify a
close path that can be triggered by accident.

The nav drawer in `AdminSidebar.js` keeps its backdrop-close deliberately.
It is a menu, it holds no input, and closing it by tapping the page is what
people expect — noted in `docs/UI_CONVENTIONS.md` so the two are not
"fixed" into agreement later.

## Loose oil

### The drum, sold by the rupee

The owner buys loose oil as a 200 litre drum — one supplier, one invoice, no
brand on it, bought the way a tanker of diesel is — and sells it across the
counter in rupees: "Rs 20 of oil", "Rs 30". Nobody measures the pour. The
money is the fact; the litres are arithmetic.

The existing lubricant form asked for litres and prefilled the amount, which
meant dividing 20 by 580 in your head at the counter, several times a day.

**Modelled as a flag on the product, not a new table.** `lubricants.sold_loose`
(migration 028). A drum _is_ a lubricant — bought in litres from a supplier,
sold over the counter, taken on credit onto the same ledger, counted in the
same monthly report — so a second table would have meant a second copy of the
stock triggers, the ledger posting, the delete-and-reverse RPC, the report
block and the export sheet. The only real difference is which number gets
typed, so that is the only thing the flag changes:

- `sold_loose = false` — the shelf. Type litres, amount prefills from the rate.
- `sold_loose = true` — the drum. Type rupees, litres come from the rate.

**The litres are derived on the server, never taken from the browser.** Sending
them would let a hand-edited form record Rs 500 of oil against a teaspoon of
stock. Deriving them also means the drum's book level can only disagree with
the real drum for one reason — the rate is wrong — which is one thing to check
rather than two. A loose product is therefore required to have a rate, by check
constraint as well as by the form.

**Litres went from two decimals to three.** Rs 20 out of a drum at Rs 580 a
litre is 0.0345 L; stored at two decimals that is 0.03, losing a tenth of every
pour, always in the same direction, on the kind of sale that happens dozens of
times a day. Done while `lubricant_sales` was still empty — a month later it
would have been a data migration. Two things had to come apart first and go
back unchanged: `rate_per_litre` is generated _from_ `litres`, and
`recalc_lubricant_after_product_update` names `opening_stock_litres` in its
`update of` list, and Postgres will not retype a column either depends on.

`formatLitresFine` (3 dp) sits beside `formatLitres` (2 dp) rather than
replacing it. "4 L" and "0.25 L" are right for a shelf; only the drum needs
millilitres, and "1.000 L" everywhere would be noise.

### Its own page under Lubricants

`/admin/lubricants/loose`. Tried mentally as one combined table first and it
does not work: most rows read "Loose Oil … 0.034 L" and bury the four carton
sales that actually need reading. The split is by product, so a sale can only
ever belong to one of the two pages, and the shelf table at the bottom of
Lubricants deliberately keeps **both** — that one is stock on hand, and someone
checking what is in the building wants the whole answer in one place.

Lubricants carries a summary card for the drum's day with a link through, so a
day is visibly not finished until both halves are in. A pump that keeps only a
drum lands on that link rather than on "no lubricants yet".

The sale dialog asks for rupees with Rs 20/30/50/100 shortcuts, states the
consequence underneath ("At Rs 580.00 a litre, Rs 30 is 0.052 L off the drum")
and names what is left in the drum. The rate is shown _before_ an amount is
typed, because a wrong rate is the one thing that can make every loose sale
wrong at once. With one drum the product select is not rendered at all.

Purchases gets a separate **Record a loose oil purchase** button rather than
one more entry in the lubricant dropdown — a drum arrives from a different
supplier with no brand, so splitting the button is what lets each form say the
right thing instead of hedging. It warns if the drum's buying rate has caught
up with its selling rate.

### Everywhere else

Reports splits "of which loose oil" out of the lubricant line and badges the
drum in the per-product table — it is most of the sale _count_ and a small
share of the money, so one combined figure flatters neither. The workbook gains
the same split on Summary and a **Kind** column on the Lubricants sheet, so
"just the drum for August" is a filter rather than trusting a spelling. The
dashboard gains an **Oil sales — packed and loose** chart, stacked, in rupees
(litres would render the drum as a flat line beside the shelf, and the drum's
litres are the softer figure anyway).

## Paging, and a cap that was corrupting a total

Asked for after noticing Purchases would grow unreadable after a year. Doing it
turned up a worse bug than the one being fixed.

**`.limit()` defaults were silently truncating figures.** `getPurchases`
stopped at 100 rows — but the Purchases page totals _what is still owed to
suppliers across every row_, so the hundred-and-first delivery pushed the
oldest unpaid ones out of the sum and the pump under-reported its own debt,
with nothing on screen to say so. `getStockChecks` capped at 60 had the same
shape: the page looks up the check belonging to the date on screen, so stepping
back far enough made it believe an old day had never been dipped and offer to
record it again. Both caps removed. **A cap on a list you are going to total is
a cap on the total.**

`<Pager>` was lifted out of the fuel-prices page, which had it inline, and is
now used by Purchases, Banking, Stock checks, the customer ledger, and both
sales tables. It takes `hrefFor(page)` rather than a base path so the date,
month or customer id already in the query string survives.

Where the slice happens is deliberate and differs by page — the reasoning is in
`docs/UI_CONVENTIONS.md`, but briefly: page in the database only when the list
is _only_ a list (the customer ledger, whose balance comes from an RPC that
sums over everything), and fetch-then-slice wherever the page derives a figure
from the whole set.

The two sales tables are day-scoped and so cannot grow without bound, but they
are paged anyway at 20: a busy Saturday of loose sales pushed the stock table
below them off the bottom of the screen.

### Verified

Rendered with realistic fixtures — the smallest possible sale, a part-credit
sale to a long customer name, a multi-line note — at 1440/1152/1024/400/360/320
and with the dialog open at 1152 and 400.

One real bug came out of it that no measurement would have shown: at 400px the
free-text note pulled the Amount column narrow enough that **"Rs 1,160" broke
after the "Rs"**, which reads for a moment as two separate figures. Fixed with
`whitespace-nowrap` on the figure — the column may widen and the table may
scroll, the number may not break.

The workbook was built from a fixture and unzipped to confirm the Kind column
is populated, the Summary carries the loose split, and the three-decimal litres
survive into the cells.

## Removing a customer

Asked for after a name was added wrongly and there was no way to take it off.

Built as the same **delete-or-retire** shape as `delete_lubricant`: an account
that never traded is deleted outright, one with credit or payments behind it is
retired, and the database decides which because the row on screen does not say.
The button is therefore **Remove**, not Delete — "Delete" would be a lie half
the time — and the confirmation reports what actually happened.

**The guard that this pattern needed and the lubricant one did not.** A retired
customer drops out of `get_customer_balances`, which is exactly what the
Customers page totals "total outstanding" from. Retire someone owing Rs 50,000
and the pump's own record of what it is owed falls by Rs 50,000 with nothing on
screen to explain it. So removal is refused while the balance is non-zero — and
in **both** directions, not just a debt:

- they owe the pump → removing writes the debt off by accident
- the pump owes them → they have paid ahead, or a payment landed on the wrong
  name. Hiding that loses money belonging to a customer, which is worse

The exception names the customer, the figure, and the next step, and it reaches
the owner more or less verbatim. The row also states the same thing before the
click, as a courtesy — the database is still the rule.

A **Removed** section under the main table lists retired accounts with a
**Bring back** button, so "removed" is never indistinguishable from "lost".
Both are owner-only; staff do not fetch the retired list at all.

Tested against the live database inside a block that deliberately aborts, so
all three attempts rolled back:

    overpaid account (pump owes Rs 4,999.72)  >> BLOCKED, naming the figure
    credits but no debits (Rs 59,186)          >> BLOCKED, naming the figure
    never traded                               >> deleted, removed: true

The role gate had to be stubbed for that run or `is_super_admin()` would have
masked every result; the stub is DDL and rolled back with everything else,
which was checked afterwards rather than assumed.

### Guide

Both languages gained the loose oil drum (setup, and the rupees-first daily
step), the new refusals — enter days oldest first, loose oil needs a rate, a
customer with a balance cannot be removed — and a line about Remove under
Customers. The two languages were diffed by shape afterwards, not by eye: same
number of stages, setup steps, daily steps, occasional items, rules and role
rows, and the same icon keys in the same order. That check is the point of
keeping the guide as data.

## The ledger works in whole rupees

The owner pointed at a customer page showing "Rs -4,999.72" and said the paisa
were useless — there is no coin below one rupee in Pakistan. He was right, and
the display was the smaller half of the problem.

**Where the paisa came from.** A credit slip's amount is litres × rate, so 11 L
at Rs 339.48 posted a debit of Rs 3,734.28. The customer paid the Rs 3,734 he
was asked for, and 28 paisa stayed on his account — not as a debt, because
nobody can hand over 28 paisa, but as arithmetic no payment will ever clear.
The page then contradicted itself: the headline read "Rs -5,000" through
`formatPKR` while the table under it read "Rs -4,999.72" through a
`formatPKRExact` added specifically so "every paisa should show".

**Fixed at the write, not just the render.** `roundRupees` now applies to every
value that becomes a customer debt or a payment — credit slips, payments,
adjustments, and lubricant sale amounts and their credit. `formatPKRExact` was
deleted; the ledger uses `formatPKR` like everything else.

Rounding only the display would have been the worse half of the fix: three
hidden 0.28s make a rupee, and the running balance drifts away from the rows
printed above it. The stored value and the shown value have to agree.

**What deliberately keeps its paisa.** The meter arithmetic.
`nozzle_readings.sale_amount` is litres × rate and genuinely carries them;
rounding it would put a day's takings out of step with the litres that produced
them. Where a whole-rupee credit comes out of a fractional sale the difference
lands on the **cash** side, which is where it belongs — cash is the residual,
and it is counted in notes. A survey before changing anything showed why this
distinction matters: 41 of 42 readings carried paisa, but only 1 credit slip
and 1 ledger entry did. The problem was never widespread, it was just in the
one place that hurt.

**The guard had to move with it.** `delete_customer` refused removal unless the
balance was exactly zero. Once the ledger displays whole rupees, a legacy
28-paisa residue reads as "Rs 0", still refuses, and explains itself by quoting
a figure the owner has no way to pay — an account that looks settled and cannot
be closed. So the guard rounds too (migration 032). It forgives at most 49
paisa, less than the smallest coin in circulation; anything a customer could
actually be asked for still blocks removal and is still named.

Verified on a fixture built and rolled back inside one aborted transaction, so
the boundary could be walked exactly rather than depending on live rows:

    0.28 residue   >> removed (treated as square)
    0.60 residue   >> BLOCKED, "still owes Rs 1"
    Rs 4,500 owed  >> BLOCKED, "still owes Rs 4500"

Then rendered: the legacy ledger's rows now read 3,734 → 0 → −5,000 and agree
with the −5,000 headline above them.

**One live account still carries the old residue.** Usama Bahawalpur is at
−4,999.72. Nothing was written to fix it — it now reads as Rs 0 against the
rupee and no longer blocks anything, and the ledger is append-only, so if it is
ever to be squared exactly that is an adjustment for the owner to post.

### The warning that disagreed with the column

Reported straight after the whole-rupee change: an account showing **Rs 0**
still warned "This account is not settled" when Remove was pressed.

Both halves of the fix had been written, but only one had been applied.
`delete_customer` was moved to whole rupees in migration 032; the browser-side
courtesy check in `RemoveCustomerButton` was left on its original `0.01`
threshold. So a 28-paisa residue displayed as Rs 0, warned that it was not
settled, and would then have been removed perfectly happily by the database —
the warning was wrong, not the rule. A courtesy check that contradicts the rule
it is previewing is worse than no check at all.

Checking the boundary properly turned up two more, neither of which the
original report mentioned:

- **`Math.round` is the wrong rounding.** Postgres `round()` and `Intl` both
  send −0.5 to −1, but JavaScript's `Math.round(-0.5)` is `-0` — it rounds half
  toward +Infinity. A balance of −0.50 therefore printed as "Rs -1" in the
  column while the button called it settled. `roundRupees` now rounds half away
  from zero, matching both.
- **`Intl` renders negative zero.** `formatPKR(-0.28)` returned the string
  `"Rs -0"`, so a customer a few paisa the wrong side of zero had a nonsense
  figure in the Owes column. Collapsed in `formatPKR`.

Verified by running the real `formatPKR` and `roundRupees` source over the
boundary and printing what the column shows beside what the button warns, which
is a stronger claim than a screenshot of one row:

    balance   OWES      warns   roundRupees
    0.28      Rs 0      false   0
    -0.28     Rs 0      false   0
    0.49      Rs 0      false   0
    0.5       Rs 1      true    1
    -0.5      Rs -1     true    -1
    4500      Rs 4,500  true    4500

`roundRupees` was checked against Postgres `round()` at each of those points
and agrees. Then rendered, with every confirmation open at once.

### Deleting a customer for good

Remove (031) deletes an account that never traded and retires one that did. The
owner then asked the obvious follow-up: a name added by mistake that somehow
picked up entries is retired for ever and sits in the Removed list looking like
a real customer who left.

**Where the line is drawn, and why there.** A purge is allowed only when the
customer's whole footprint is entries the owner typed himself — payments and
adjustments. No credit slips, no lubricant sales. That is not caution for its
own sake; the two kinds of row are genuinely different:

- a **credit slip** belongs to a nozzle reading. That reading's `credit_amount`
  must equal the sum of its slips, and the litres behind it are part of the
  day's takings and the month's report. Deleting one either breaks the
  constraint or silently rewrites a month already exported.
- a **typed entry** belongs to nobody but the customer. No reading depends on
  it. If the customer was a mistake then so was the entry, and removing both
  leaves every other figure exactly where it was.

So a customer who ever actually traded still cannot be purged, and the refusal
says why and points at clearing the day on Readings, which reverses the slip
properly.

**How it gets past the append-only guard, without weakening it.**
`ledger_entries` has a BEFORE DELETE trigger that refuses everything, service
role included — the most valuable guarantee in the schema. Rather than
disabling it (which would be off for every other session while it was off), the
guard learned one named exception: a delete is permitted only while
`app.purging_customer` holds that customer's id. It is transaction-local and is
set in exactly one place, by `purge_customer()`, after every check has passed.

That was the part worth testing hardest, and it was tested by trying to break
it rather than by trying to use it:

    plain DELETE on ledger_entries  >> refused (guarantee intact)
    plain UPDATE on ledger_entries  >> refused (as always)
    wrong name typed                >> refused
    correct name                    >> purged, 2 entries
    a bystander customer's entries  >> untouched
    plain DELETE after the purge    >> refused (setting did not leak)

And the two refusals against the real accounts:

    Usama (1 credit slip)      >> BLOCKED, pointing at clearing the day
    Abdul Latif (Rs 59,186 out) >> BLOCKED, must be settled first

All inside blocks that abort; the customer count, ledger count, `is_super_admin`
body and the setting itself were re-checked afterwards rather than assumed.

**Typing the name is the confirmation, not a Yes button.** Everything else
destructive here is recoverable — a retired customer comes back, a deleted sale
posts a reversal — and this one is not, so it asks for something a mis-aimed
click cannot produce. Offered only from the Removed list, so reaching it is
two deliberate decisions. Checked in the database as well as the browser.

No tombstone: the owner asked for gone, and a hidden record of the name would
mean it never really left. The record of a purge is this entry and the
migration.

## Why navigation felt slow, and what prefetch actually does

The owner asked why moving to the Guide still shows a loading skeleton, and
whether caching could help without serving stale figures. Worth writing down
because the answer was measured, and two of the measurements contradicted what
seemed obvious.

**Where the time goes.** Every `/admin` page is dynamic, because
`requirePageRole()` reads cookies. Before any HTML exists the server does
`getClaims()` plus a `profiles` SELECT - at least one Supabase round trip. The
Guide's own content is a compile-time constant in `guide-content.js`, so for
that page the round trip _is_ the entire wait, and `loading.js` covers it with
a full-page skeleton that makes 300ms read as a page load.

`proxy.js` and the layout are already clean: the proxy uses `getSession()` (no
round trip unless the token is expiring) and `getSessionProfile` is wrapped in
React `cache()`, so the layout and the page share one lookup.

**A shortcut that does not work.** The Guide is open to both roles, so the role
query looks like waste. It is not: the same query checks `is_active`, which is
what locks out a deactivated staff login on their next navigation. Load-bearing.

**Deleting the skeleton does not work either.** Tested with two throwaway
routes: a child segment with no `loading.js` of its own **inherits the
parent's**. Removing `app/admin/guide/loading.js` would give the Guide the
_dashboard's_ skeleton, which is worse.

**What does work, measured on a production build** (dev mode is not
representative - it showed no benefit at all, which nearly led to the wrong
conclusion):

    default prefetch   skeleton at 65ms, content at 874ms
    prefetch={true}    content at 70ms, no skeleton

And on the staleness question the owner actually asked:

    prefetched copy still reused after 45s   (the window is real, not momentary)
    mutate + revalidatePath, then navigate   -> shows the NEW value, in 70ms

So prefetch and the 81 `revalidatePath` calls already in `actions.js` work
together: fast, and busted the moment anything is saved **in the same
browser**. The residual gap is another person's session - their action cannot
clear this browser's router cache, so a figure could be up to ~45s old until
the next load.

**Applied to the Guide only.** Not for staleness reasons - the Guide has no
data - but for cost. App Router prefetches on viewport entry, and the whole
sidebar is in the viewport on a laptop, so prefetching all eleven links would
run ten extra page renders with their queries on every admin page view. On a
cheap tablet over mobile data those compete with the page actually being waited
for.

**Still open, and both are infrastructure rather than code.** The database is
in `ap-southeast-1` (Singapore) and there is no `vercel.json`, so functions run
in whatever region Vercel chose - often Washington DC. If so, every round trip
crosses the Pacific twice, which would dominate everything above. And the
`profiles` lookup could move into the JWT as a custom claim, removing a round
trip from every page, at the cost of a deactivated login staying valid until
its token refreshes.

### The app was on the wrong side of the Pacific

Following the navigation-speed work above, the Vercel function region turned
out to be `iad1` (Washington DC) while the Supabase project is in
`ap-southeast-1` (Singapore). Every page therefore paid:

- ~230ms getting the request from Pakistan to Virginia, and
- ~230ms **per query**, Virginia to Singapore and back.

`vercel.json` now pins the functions to `sin1`. Both legs improve at once: the
reader's request travels roughly 70ms instead of 230ms, and each database round
trip drops to single-digit milliseconds.

Singapore rather than Mumbai, which is physically closer to the reader: one
navigation makes **one** user round trip but **several** database ones, so
co-locating with the data wins. If the database is ever moved, this moves with
it.

**This also called off the JWT change.** The plan had been to move the role
into the access token to save the `profiles` round trip on every page - the
owner had agreed, on the grounds that staff are rarely deactivated. But that
round trip was only expensive _because_ of the region; once the function sits
beside the database it costs about 2ms. Trading immediate lockout of a
deactivated staff login for 2ms is a bad deal, and it would have stayed in the
codebase long after the reason for it disappeared. Not done.

## Opening balances, and saying which way the money goes

Two requests from the owner, and the second is the one that was quietly
dangerous.

### A customer can now be created with the balance they arrive with

Almost nobody typed into this app is a new customer — they came out of a paper
register, and plenty already owe money on the day the name is entered. The only
route before was: create the customer, then remember to open their page and
post a manual adjustment. The second half is the half that gets forgotten, and
an account silently starting at zero when the man owes Rs 40,000 is a loss
nobody notices until he stops paying.

The New customer form now asks, with "Nothing owed — starting fresh" as the
default so the ordinary case is still one tap.

**Written in one transaction** (`create_customer_with_opening`, migration 034)
rather than two inserts from the action, because two inserts can leave the
customer created and the balance missing — which is exactly the silent zero the
field exists to prevent. The amount is always positive and a separate direction
says which way it goes; a signed figure would let "-500" and "they owe us"
disagree, with nothing to settle the argument.

### "Increases what they owe" was unreadable, and getting it wrong is silent

The manual adjustment offered a dropdown reading _Increases what they owe_ and
_Reduces what they owe_. The owner could not tell them apart at a glance — two
long phrases differing by one word in the middle, both starting the same shape.

This is the worst place in the app for an ambiguous control. Picking the wrong
direction does not fail: both are legal, no constraint can catch it, and the
ledger is append-only, so the mistake is permanent and has to be corrected with
a second entry. The only defence is not making it in the first place.

Two changes, and the second is the one that actually works:

- **Cards in yard language, shared between both forms.** `BalanceDirection`
  gives "They owe more" / "They owe less", each with a line saying _when_ to use
  it — the situation is easier to recognise than the arithmetic. Shared so the
  same two ideas are never described in two vocabularies, which is how the
  confusion started.
- **The resulting balance, shown before saving.**

      Rs -4,999 → Rs -9,998
      The pump would owe them Rs 9,998 after this.

  A label can be misread. A figure going from 4,999 to 9,998 when you meant to
  clear the account cannot. Rendered both directions against a customer owing
  Rs 3,000 and one Rs 4,999 in credit, at 1152 and 400px.

The general rule is now in `docs/UI_CONVENTIONS.md`: **any control where both
choices are valid and only the operator knows which is right should show its
consequence before it is committed.**

### Adding a customer became a dialog, and details became editable

**The New customer page is gone.** Adding a customer is a rare setup act done
from the list and finished by looking at the list — the same argument
`BankAccountForm` and `PurchaseForm` already follow. The old route also cost
two navigations, each paying a round trip, to land on a detail page showing
nothing but what had just been typed. `createCustomer` now returns instead of
redirecting, and the dialog closes over a list that already has the new name on
it. `/admin/customers/new` was deleted rather than left as a second way in.

**Made to fit without scrolling, which took more than tightening.** A form that
arrives already scrolled hides its own Save button. Stacked in the default 32rem
dialog it ran **195px** past a 1024×768 laptop once an opening balance was being
entered. Shrinking the three choice cards would have undone the readability they
were added for a commit earlier, so the dialog went to `size="lg"` with two
columns — contact fields left, opening balance right. Measured after, not
assumed:

    new-1024x768        fits, no scrollbar   (was: scrolls by 35px)
    new-1024x768-owes   fits, no scrollbar   (was: scrolls by 195px)
    new-1440x900-owes   fits, no scrollbar   (was: scrolls by 76px)
    edit-1024x768       fits, no scrollbar

The 400px phone still scrolls and that is correct — the dialog is a full-screen
sheet there and the columns stack.

**Name, phone, vehicle and credit limit are now editable** from the customer's
own page. They were not, so the only way to fix a misspelled name was to add a
second customer and split the history across the two — the worst possible
outcome for a ledger. `updateCustomer` touches details only: the balance lives
in the append-only ledger and still moves solely by payment or adjustment, which
is what makes this safe to leave with staff.

### Both oil sale buttons, in one place, saying which is which

The drum's sale button existed only inside its summary card halfway down the
Lubricants page — the more frequent of the two sales in the harder place to
find. Both now sit in the header, and both say what they record: **Record a
lubricant sale** and **Record a loose oil sale**. "Record a sale" was fine while
it was the only one; beside a second sale button it says nothing.

Both are `.btn-primary`, which is a deliberate departure from one-primary-per-
view: they are peers, and demoting either would point the reader at the wrong
one. Noted in `docs/UI_CONVENTIONS.md` so it is not "corrected" later.

_Process note_: `npx prettier` was run on `CustomerForm.js` without checking the
repo first. There is no prettier config here and the codebase uses single quotes
at a 100 column width, so the default run rewrote the whole file to double
quotes. Re-run as `--single-quote --print-width 100`, which reproduces existing
files byte-for-byte — worth using if prettier is ever run again.

### A bin instead of the word, and feedback on every button that waits

Two reports, and the second turned out to be thirteen bugs rather than one.

**The "Remove" links looked unfinished.** A column of red text down a table
reads as a list of links, not a set of buttons, and the same word repeated on
every row is noise — the row already names what it applies to. Replaced with a
trash `IconButton`, and the same treatment given to the five other delete
triggers (purchases, expenses, bank transactions, fuel rates, lubricant sales)
so the whole app deletes the same way.

**No icon library.** `Icon.js` already explains why — seventeen icons now, all
on one 24px grid at one stroke weight, and adding one is editing a file rather
than taking a dependency and someone else's idea of what a bin looks like. The
trash was drawn to match.

This is the one deliberate exception to "icons never carry meaning alone". That
rule is about icons carrying _information_ — a nozzle's Entered badge, a fuel
type — where colour is the cue that fails in a dim office. A control is
different, and two conditions keep it honest: `label` is mandatory and becomes
both `aria-label` and the hover title, and every one of these confirms **in
words** before anything happens. Text is kept where the words _are_ the
distinction: _Bring back_ beside _Delete for good_ would be a guess as two
icons.

**"Clicking some buttons freezes the UI."** It was not a freeze — it was
**thirteen submit buttons with no pending state**. `SubmitButton` has wrapped
`useFormStatus()` since early on and is used in 25 places, but every
destructive confirm had been written as a plain `<button type="submit">`: Yes,
remove / Yes, delete / Bring back / Sign out. Press one and nothing changes
until the row vanishes, which is indistinguishable from a tap that never
registered — so the natural response is to press again.

All thirteen now use `SubmitButton` with a fitting label — Removing…,
Deleting…, Bringing back…, Signing out… Verified by holding the Server Action
open for 2.5s to stand in for a slow connection, which is when it actually
matters:

    during the action: label "Removing…", disabled=true

Disabled matters as much as the label: it is what stops the impatient second
tap posting the same thing twice.

Left alone deliberately: the month pickers on Expenses and Reports are plain
GET forms in server components, so the navigation brings its own `loading.js`.
`PaymentStatusToggle` already updates optimistically and `StaffList` already
used `SubmitButton`.

### The guide caught up, and the docs learned to brief a stranger

**Guide, both languages.** It had never covered two things the owner uses:
correcting a customer's details, and the manual adjustment — which is the one
control that confused him in the first place, so leaving it undocumented was
the wrong gap to have. Added, along with the whole-rupee rule.

The Customers card then became ten lines covering six different operations,
which is worse for someone learning than the four-line cards beside it. Split
into **Customers** (pay, add, opening balance — the routine) and **Fixing a
customer** (edit details, adjust the balance, remove — rare, owner-only), with
the pencil icon on the second. Both languages checked by shape afterwards:
7 setup steps, 7 daily, 7 occasional, 10 rules, 7 role rows, matching icons.

**Two docs additions aimed at a session that has not been here before**, since
the next piece of work mentioned is an offline Electron build:

- A **"Where things stand"** section at the top of this file. Ten narrative
  entries in theme order is the right shape for _why_, and the wrong shape for
  _what is true today_ — so there is now a table of the recent work and a list
  of the three things that are load-bearing and easy to break.
- A **"If you are porting this off Supabase"** section in `README.md`, because
  the most misleading thing about this codebase is how little of the important
  logic is in the JavaScript. Thirty-four migrations of triggers and
  constraints hold the rules that make the books trustworthy, and swapping
  Postgres for SQLite silently drops all of them — nothing in the UI would
  complain, because the UI check was only ever the courtesy. It also names what
  is genuinely Supabase-shaped (the clients, `proxy.js`, every `.rpc()` call,
  RLS as the real access control) against what ports unchanged (all the
  components, the helpers, the guide content, the Excel export).

### The guide had too much detail to be read

The owner's verdict on the guide, after it had been brought up to date: _"too
much detail... add some visual markers instead, so that it does not become
boring to read."_ It measured **4,603px** — five screens on a laptop — and the
reader it is written for is an attendant who has opened it to find one answer.

Where the height was: setup 1,133px (24%), the evening routine 1,127px (24%),
the rules 779px (17%), the section map 668px (14%), roles 442px (10%).

**Three markers replaced prose, and one section folded away:**

- **Location chips.** Ten steps across the two languages said, in a sentence,
  where to go. They now carry `where: { icon, path }` and render it as a pill
  under the step heading — `Lubricants → Record a lubricant sale`, with the
  _same icon as the sidebar tab_, so it points at something already on screen.
- **Rules lead with the claim.** `rules.items` went from strings to
  `{ title, body }`; the title is bold. Ten rules are now ten scannable lines
  rather than ten paragraphs behind ten identical warning triangles — the
  repeated icon was marking nothing, and the eye had nowhere to land.
- **The one-time setup folds.** The page already tells the reader to skip it,
  so it is now a native `<details>` styled as a card row. No JavaScript, no
  state, still found by the browser's own search.

The chips _raised_ the height first — 4,603 → 4,957px — which is worth
recording, because it is the shape of this kind of change: a marker costs
vertical space and buys scanning speed. Folding the setup is what paid for
them. Final: **3,850px English, 3,718px Urdu**, a fifth shorter than it began
while carrying more signposting than before.

Checked in both languages at 1152px and 400px, and by shape after every edit
(3 stages / 7 setup / 7 daily / 7 occasional / 10 rules / 7 role rows, icons
matching). One measurement worth not repeating: a first pass reported the
phone width scrolling sideways, and the culprit was the **devcheck route, not
the page** — `/devcheck` sits outside `app/admin/layout.js`, so it lacks the
`px-4` that `.table-scroll`'s `-mx-4` is there to cancel, and the roles table
hung 16px off each edge. Wrapping the devcheck page in the same container as
the real layout is now part of using it; without that, every full-bleed table
in the app looks broken at 400px.

### The rate panel on Settings shows five changes, not seven days

_"Show only the recent 5 readings, rest should be visible in view all."_

The slice was seven whole **days**, and the reason it was counted in days
rather than rows is still right: the rate for both fuels usually moves
together, so a plain `limit` shows diesel's new rate with petrol's cut off the
bottom, and the owner reads the two as a pair to check both moved.

But at two fuels a day, seven days is fourteen rows — the panel had grown its
own scrollbar, a small scrolling table inside a page that already scrolls.

`getRecentFuelPrices()` now takes a **row cap that cuts on a date boundary**:
keep rows until there are five, then keep going only while the date has not
changed. Five or six rows, and a day is never half-told. Both properties are
kept; only the thing setting the height changed.

Two things came with it. The query now orders by `fuel_type` after the date,
matching `getFuelPricesPage()`, so a day's pair reads in the same order on the
panel and on the full history instead of in whatever order the rows were saved
— the screenshot that prompted this showed Petrol above Diesel on one day and
below it on the next. And the heading dropped its day count: "The most recent
changes", because a number in that sentence has to be re-checked every time
the cut changes, and it told the reader nothing they wanted.

Rendered at 1440 / 1152 / 1024 / 400 with the owner's own rows as fixtures:
6 rows, no scrollbar inside the panel at any width, no sideways page scroll,
no clipped figures. Edge cases checked against the loop directly — a date
corrected six times over still returns whole (6 rows), fewer rows than the cap
returns all of them, no rows returns none.

### A window on the dashboard charts, and eight rates to a page

Two requests, both about a screen being fixed at a size that no longer suited
it: _"the graphs on dashboard also need date filter"_ and _"this page should
show 8 max and next page the remaining, means the pagination is set at max 8
so scroll bar does not appear."_

**The charts can now be asked for 7, 14, 30 or 90 days.** They were hard-wired
to 14. `<TrendRange>` is four fixed windows rather than a from/to pair,
because the day they _end_ on is already chosen by `<DateNav>` at the top of
the page — the only thing missing was how far back to reach, and asked as a
range that would be two date pickers, four taps, and a window that can be
entered backwards or empty. One tap, no invalid state. 90 is the outer limit
on purpose: at 400px that is a 2px bar, and past it the right answer is a
month-by-month chart, not a longer axis.

The heading now spells out the span underneath — "Last 30 days / 10 Jul 2026
to 08 Aug 2026" — because these charts end on the day the page is showing, and
"Last 30 days" is a lie the moment the reader has stepped back a week.

**`<DateNav>` learned to carry a filter.** Its arrows, its date box and "Back
to today" all rebuild the query string from scratch, so without this, stepping
one day with a 90-day window open would drop back to 14 and the reader would
blame the arrow. `extraParams` threads it through all three, plus the hidden
fields the `noscript` GET form needs. `trendDaysFrom()` validates against the
allowed set rather than `Number() || 14`, so `?days=999` cannot ask Postgres
for three years of daily rows.

**All fuel rates pages by eight instead of 25.** 25 rows overran
`.table-scroll`'s 70vh cap, so the card grew a scrollbar inside a page that
already scrolls and the wheel did one of two things depending on where the
pointer sat. Eight clears the cap everywhere this app is read, and
`FuelPriceTable` now sets `max-h-none` to drop the cap outright — neither
caller can reach it any more, and the sticky heading it existed to support is
no loss when the whole table is visible. Even on purpose, so a day's petrol
and diesel do not straddle the fold.

Verified at 1440 / 1152 / 1024 / 400 across all four windows: 8 rows, no
scrollbar inside the card, no sideways page scroll, no clipped figures. The
query-string carry was checked by reading the rendered hrefs — both arrows,
"Back to today" and the hidden field all hold the window, `?days=999` falls
back to 14, and the current window renders as a `<span>` with no `href`.

**One measurement worth writing down, because it inverts the usual lesson.**
The 90-day chart screenshotted at 400px as a flat line of slivers and looked
like a real bug. It was not: recharts animates 90 bars for longer than
`networkidle` plus 500ms, and the shot caught them mid-grow. Querying the
rendered geometry gave heights of 84–184px, and a re-shot after 2.5s matched.
Screenshots catch what the DOM hides, and this once it was the other way
round — when a chart looks wrong, measure a bar before believing the picture.

### The chart filter was throwing the reader back to the top

Reported the day it went out: _"i deployed, its working, but changing from 7
days to 14 moves the UI to the top."_

A Next.js `<Link>` resets the scroll position, which is right when the whole
page changes and wrong for a filter. The charts are the last thing on the
Dashboard, so picking a different window scrolled back up past the tiles, the
fuel cards and the tanks — to look at a chart the reader was already looking
at. `scroll={false}` on the window links.

Measured both ways rather than assumed, because "it stayed put" is the kind of
result that also happens when the click did nothing: without the flag the page
went from scrollY 1087 to 0 and the control moved from 379px down the viewport
to 1466px off the top of it; with it, 1087 to 1087 and 379 to 379, at 1152px
and 400px, across 7→14 and 14→90.

Deliberately not applied to `<Pager>` or to the `<DateNav>` arrows. Those
change what the whole page is about, and landing at the top of the new content
is the right behaviour there. The rule is narrower than "links should not
scroll": **a control that changes only what sits beside it should not move the
page.**

## An audit trail

### Who did what, written by the database

_"Add trail logs and log the user activity and create a tabular log data in
the navigation menu after guide button."_

The owner has staff logins, and the app deliberately lets a past day be
corrected — necessary, and also the exact shape of a mistake being quietly
tidied away. Nothing recorded who did either. Migration **035** adds
`activity_log` and one trigger across sixteen tables; `/admin/activity` reads
it, owner only, below the Guide in the sidebar.

**It is in the database, not the Server Actions.** An app-level log records
only what went through the app — not a second tab, not the Supabase console,
not a future script, and not whichever action someone forgets to instrument.
The one time an audit trail gets opened is the time something happened that
nobody expected, which is precisely the case an app-level log misses.

**One function serves all sixteen tables** by going through `to_jsonb(NEW)`
rather than naming columns, so a column renamed later degrades to a vaguer log
line instead of breaking the write. Each line is built as a finished English
sentence _at write time_ — "Unit 1 · Nozzle A — 151.15 L, Rs 50,055" — because
half these rows describe something that no longer exists, and a log that joined
back to the row at read time would render a deletion as blanks.

**It can never block a write.** The trigger body ends in `exception when others
then return coalesce(new, old)`. A pump that cannot record its evening because
the logging is broken is worse than a pump with no log. The cost is that a bug
in it is invisible except as a gap, which is why every branch was exercised
before it shipped rather than after.

**Three things it deliberately stays quiet about**, each found by running it:

- _Stock recalculation._ `tanks.current_stock_litres` is recomputed by trigger
  after every reading, so logging it would bury each real event under a line of
  machine bookkeeping. An update whose only changed columns are ignored is not
  logged at all.
- _The ledger row a credit slip posts for itself._ One event, described twice,
  and the slip is the half a person recognises.
- _The cascade under a deleted reading._ Deleting a reading deletes its credit
  slips, and each slip's `on delete set null` then UPDATEs the ledger row it had
  posted. The log said "Charge to a customer changed" underneath the deletion
  that caused it. `credit_sale_id` and `lubricant_sale_id` joined the ignore
  list.

**Append-only, and unforgeable.** No insert policy at all — the only writer is
the security-definer trigger — plus update and delete triggers that raise the
way the ledger's do. Verified in an aborted transaction: the owner sees the
rows and a staff login sees none; anon is refused at the grant; an insert by
hand violates the policy; update and delete match zero rows through the API,
and raise the append-only message even from a role RLS does not filter.

**Testing against a live pump.** Every branch was run against real rows inside
transactions that ended in `raise exception`, so nothing committed. Row counts
were re-checked afterwards — readings 42, customers 6, rates 10, bank
transactions 8, all unchanged — and the log was empty when the migration
landed. Three test attempts failed on generated columns (`litres_sold`,
`gain_loss`, `rate_per_litre` cannot be inserted), which is the schema being
right and the test being wrong.

**One wording bug the screenshots caught.** `entry_date` exists so the page can
say "filed against 07 Aug" when an entry was made against an older day than it
was typed on — the shape of both an honest correction and a dishonest one.
Populating it for a fuel rate printed "filed against 08 Aug 2026" under a line
already reading "from 08 Aug 2026": a repetition, and the wrong word. Rates no
longer set it.

### The log stopped being a table

It was a `<table>` first, like every other list here, and at 400px it measured
clean — nothing clipped, no page scroll — and looked broken: two narrow columns
of timestamps beside acres of white, because the row heights were set by a
700px sentence sitting off the right-hand edge. The app's usual answer, let the
table scroll inside its card, works for Purchases because every cell there is a
short number. Here the column that matters is a paragraph, and scrolling right
to find out what happened defeats the page.

`<ActivityTable>` is now one piece of markup that is four columns above
`@[54rem]` and a stack below, using `@[54rem]:contents` so the when/who/amount
wrapper dissolves into grid cells on a wide screen instead of being written
twice. Full note in `docs/UI_CONVENTIONS.md`.

The column widths were measured rather than guessed, and the first guess was
wrong in the way this project keeps punishing: at a 46rem threshold the columns
cramped at a 1024px window and **"Rs 7,686,000" wrapped onto two lines**. The
DOM had reported no clipping and no overflow both times. 54rem with
12/12/1fr/8rem, `whitespace-nowrap` on the timestamp and the figure but not on
the name — a name may wrap, a number may not.

Screenshotted at 1440 / 1152 / 1024 / 768 / 400 / 360, with the sidebar's 240px
mocked into the devcheck so the container widths matched the real app rather
than the viewport.

## The Lubricants page, made legible

### "It should show sales but it is still unclear which sales"

The owner's report, and it was exactly right. The page counted **packed sales
only** and nothing on it said so: four unqualified tiles (Sales / Litres sold /
Cash / On credit), a heading reading "Sold on 09 Aug", and a description —
"Counter sales. Stock is kept in litres, packs and loose oil alike" — that
described the _stock_ and implied the drum was included in the _sales_.

Two feet below, the shelf table listed the drum with "sold 1 L" against it. So
the screen said "nothing sold today" and "the drum sold a litre" at the same
time. Neither was wrong; they were counting different things and nothing on the
page said which.

**The day leads, then its halves.** The tiles are now `Oil sold today` (both
kinds), `Packed, off the shelf`, `Loose, out of the drum`, `On credit` (the
whole day, because "how much of today's oil is not in the drawer" does not care
which container it came out of). The split that was invisible is now the first
thing on the page.

**The shelf says which span it covers.** _Bought_ and _Sold_ there are running
totals since the pump opened, and that was in 12px grey text at the very bottom.
It is now a line under the heading — "Everything bought and sold up to 09 Aug
2026, not just today" — which is the sentence that resolves the contradiction
above. Packed products sort before the drum, and the drum's selling rate moved
onto this table from its old page, because for a drum the rate is load-bearing:
it is the only thing turning "Rs 20 of oil" into litres off the stock.

**Low stock got a word.** The In stock column was signalling "out of stock" by
printing the number in red and nothing else — colour as the only cue, on a
cheap tablet in a dim office, which is the exact failure this repo's icon and
colour rules exist to prevent. "0 L" and "16 L" are the same shape to a
red-green colourblind reader. There are now `out of stock` and `low` badges.

### The drum came back onto the same page

_"Lube oil sale should also show here instead of a separate page"_ and _"I
don't want this button here, just the loose sales here."_

This reverses the split recorded further up this file, and the original reason
for it was sound: a run of rupee-priced pours buries the four carton sales that
need reading. What changed is the answer, not the problem. A route split makes
the reader work out _where a sale lives_ before they can look for it, and a
day's oil takings were never on one screen.

So: one table, `loose` badge on the pours, and an `All oil / Packed only /
Loose only` chip row above it. The busy-Saturday view that justified the split
is one tap away; the ordinary case is right by default. Litres are formatted
per row — three decimals for a pour, two for a carton — because "0.03 L" at two
decimals rounds most of a rupee's worth away.

`/admin/lubricants/loose` is now a `redirect()` to `?kind=loose`, carrying the
date. Deleting it would 404 the Dashboard's oil card, the owner's bookmark and
any link sent over WhatsApp. The navigation card that used to sit mid-page
pointing at it is gone, which is what was asked for.

### Two smaller things

**A 2px button bug, everywhere in the app.** Reported as "the buttons are a bit
larger than manage lubricant button" — and measurement said the opposite: the
filled `.btn-primary` was **48px** and the outlined `.btn-secondary` **50px**,
because the outlined one carries a 1px border and the filled one did not. Every
pair in the app was two pixels apart and, centred in a flex row, a pixel off
each other's baseline. `.btn-primary` now carries an invisible border in its
own fill colour. All three buttons measure 50px at every width.

**The Urdu word is the label.** The balance-direction cards now read **"They owe
the pump (بنام)"** and **"They have paid ahead (جمع)"**, on both the New
customer form and the manual adjustment, with **(نیا کھاتہ)** on the
nothing-owed option. These are the words a Pakistani shopkeeper's register has
used for a debit and a credit for a century — the owner has been writing them
by hand for years, and no English phrasing was ever going to compete with that.
The English stays as the gloss for staff who may not share the habit.

Wrapped in `<bdi lang="ur" dir="rtl">`: an unmarked right-to-left run inside an
English sentence lets the bidi algorithm drag the brackets around it, stranding
the closing paren on the far side of the phrase. A step larger than the English
beside it, too — Urdu script carries more detail per character and does not
survive 14px.

Rendered at 1440 / 1152 / 1024 / 400 / 360 with a mixed day as fixtures: ten
rows, no clipping, no sideways page scroll, and no money figure or timestamp on
two lines at any width.

### A scrollbar in the nav, and seven delete guards that moved the page

**The sidebar grew a scrollbar the moment Activity was added.** Measured rather
than guessed: the column needed **953px** — identity 180, twelve links 644,
Account/Sign out 129 — against the 945px the owner's screen gives it. Eight
pixels short, and Windows answers that with a permanent 15px grey slab down the
side of the nav.

Trimmed to **808px** and it fits with room over: links from 48px to 44px (still
the app's own minimum target — `IconButton` is `h-11`), gaps from 4px to 2px,
and the identity block from 180px to 131px, since the business name was
wrapping to two lines at `text-base` in a 240px column.

The `overflow-y-auto` **stays**, and so does a scrollbar on genuinely short
windows — Sign out is the last thing in that column, and a list that silently
ends above it leaves the owner unable to sign out with nothing on screen to say
why. What changed is that it is a 6px hairline now (`.nav-scroll`) instead of
the browser default, and it only appears below about 810px of viewport.

**The delete guards became dialogs.** Reported as _"they shift the UI"_, and
that is exactly it: each of the seven replaced its own trash icon with a
question, two buttons and sometimes a paragraph, inside a table cell — so the
row grew, the column widened, and every row below jumped. On the Customers
table the row you were aiming at moved while you were reading the question.

`<ConfirmAction>` is the shared shape now. Verified by watching the row _below_
the one being confirmed: it moves **0px** at 1152 and at 400, where before it
dropped by the height of the expanded block. The dialogs also have room for the
sentence that matters — the fuel-rate one can say in full that readings already
entered keep the rate they were sold at, instead of six words squeezed into a
cell.

Two things kept deliberately: a refusal leaves the dialog **open**, because the
database's explanation is the whole point of the interaction and closing would
throw it away; and `PurgeCustomerButton` keeps its own dialog, because its
trigger must be the words _Delete for good_ beside _Bring back_, and its body
owns the type-the-name field that gates the submit.

### The two dashboard charts were drawing the same picture

_"Both of these graphs shows almost the same thing, configure the left graph
to show sales of petrol and diesel in litres too with a toggle."_

Correct: on a pump paid almost entirely in cash, "total sales" and "the cash
bar" on the chart beside it are the same height every day, so the second chart
told the reader nothing the first one had not already shown.

`<SalesTrendChart>` now toggles between **Rupees** (the original single bar)
and **Litres** — petrol and diesel stacked, in the app's own fuel colours, with
a legend since two series need one. Litres is the view rupees structurally
cannot give: a fuel-rate change does not move the bars, so a quiet day is
visible as a quiet day rather than mistaken for a cheaper one.

No database change — `get_sales_trend` (migration 005) already returns
`petrol_litres` and `diesel_litres` alongside the money; the chart simply
wasn't using them. The toggle is component state, not a query-string filter
like `<TrendRange>` beside it: that control changes the date window and needs a
new query, this one redraws rows already on the page, so a round trip would
buy nothing.

Verified at 1152 and 400px, in both modes, including a round-trip
Rupees→Litres→Rupees to check for leaked state: no clipping, no sideways
scroll, 30 bar paths present after the animation settles either way. One
retest needed — the same recharts-animation trap noted elsewhere in this file:
a screenshot taken immediately after `networkidle` catches the bars mid-grow
and looks like a regression that is not one.

### Company Assets — a private record of what the pump owns

_"I need a page named Company Assets, where I can add all the company assets
with their value at the time of purchase, and edit or delete them. This page
is just for the owner to see what he bought using pump money."_

A new page, `/admin/company-assets`, owner-only in the same way Banking is —
RLS refuses `data_entry` outright, the nav link is hidden for anyone else, and
neither is treated as the real gate. Nothing here touches a sale, an expense,
or the month's profit; it is a separate ledger of things bought and _kept_
(a vehicle, a generator, machinery, property), not things bought and used up.

**Cards, not a table.** Every other list in the app is a table because its
rows are short numbers read in columns. An asset is a name, a category, a
value and an optional note — closer to a small record than a row — so it gets
the same treatment the activity log got when a table stopped fitting it (see
"When a list should stop being a table"). Nine cards a page, three columns
wide on a laptop.

**A new picker shape.** Choosing the category is five icon tiles in a
`role="radiogroup"`, not a `<select>` — see the new UI_CONVENTIONS.md section
"Picking one of a handful of categories" for why this is a different pattern
from `BalanceDirection`, and for the client/server-boundary reason the
category list itself lives in `app/_lib/asset-categories.js` rather than
inside the client form file.

**The four header figures come from a database RPC**
(`get_company_assets_summary`, migration 036), not a sum over the page's nine
rows — the same rule, and the same historical bug it exists to avoid, as
`getPurchases()` earlier in this file: a capped list's total silently
shrinking the moment a second page exists. Total value, asset count, biggest
category by value, and the newest addition all come from the whole table
every time.

Migration 036 also extends the activity-log trigger (035) to `company_assets`,
so adding, editing or removing an asset writes the same kind of audit-trail
line everything else does — reproduced from `pg_get_functiondef` against the
live function rather than retyped, to avoid the trigger silently drifting
from the sixteen tables it already covers.

Verified end-to-end against live data with nothing written: the whole
migration, plus inserts, RLS checks for owner/staff/anon, the summary RPC and
the trigger's output, ran inside a transaction that ends in a forced
`raise exception` so it always rolls back, then a read-only follow-up query
confirmed the table and the activity log were untouched. Only then was the
migration applied for real. The Server Actions were not exercised through the
live authenticated app — that would need the owner's own login — so they rest
on that database-level proof plus a passing build, the same as any other
action shaped like `createExpense`/`updateTank`/`deleteExpense`.

Rendered with fixture data covering the awkward cases — a long wrapping name,
a seven-figure value, a card with no note — at 1440/1152/1024/400/360px: no
clipping, no sideways scroll. The category picker reflows 3 columns to 5 at
`@[26rem]`, and the delete confirmation (`<ConfirmAction>`) was measured
before and after opening to confirm the surrounding card grid does not move,
the same check the guards-that-moved-the-page fix above established.

### A whole day went in at zero, and nothing on screen said so

_"Father came back after 2 days to enter the reading and mistakenly added the
reading in today's section, instead of Sunday, without knowing that he missed
a day."_ Real evening, real numbers: 09 Aug 2026 sat at 0 of 6 nozzles while
10 Aug was entered in full — the meter still balanced (opening carried
straight from 08 Aug's close), so nothing was double-counted, but a whole
day's cash and litres were never recorded as their own day, and nothing told
him that had happened.

**The database already allows this on purpose** (`027_no_backfill_without_room.sql`):
a genuine gap and a day skipped by mistake are the same shape on the wire, so
it cannot be the thing that refuses one and not the other. Only the UI knows
whether a human meant to.

Two things were built. One survived.

- **A day-completion strip was tried three times and removed.** Tiles under
  the controls, then the same tiles inline, then seven small circles centred
  beside the date banner with a pulse on a day nobody had entered. Each was
  lighter than the last and none of them earned the room they took on a screen
  whose job is six nozzles — _"I just needed a visual indication… things did
  not work out."_ Its RPC (`get_reading_completion`, migration 037) went with
  it in **038**. The full account is in docs/UI_CONVENTIONS.md → "A day-completion
  strip on Readings was tried and removed", written down so a fourth attempt
  starts from what already failed rather than from the idea.

- **A checkbox that gates Save**, inside `ReadingForm`'s entry dialog. When a
  nozzle's last reading isn't literally the day before the one being entered,
  a red box names the missing day(s) and what saving now will do to them, and
  the Save button stays disabled until "Yes, \[day\] was missed on purpose —
  save this day anyway" is ticked. Not a second dialog stacked on the one
  already open — see docs/UI_CONVENTIONS.md → "A gap the database allows on
  purpose still wants a checkbox" for why a checkbox was the right shape here
  and `<ConfirmAction>` was not.

Verified with a fixture reproducing the exact scenario — a gap from Saturday
to Monday, and a control nozzle with no gap for contrast — at 1152 and 400px:
the Save button measured disabled before the checkbox was ticked and enabled
after it, at both widths.

## The dip that was measuring the wrong day

Reported as _"the daily stock reading when compared to dips differ by a lot"_.
Two bugs and a third found on the way, all in the same figure.

### The dip is taken before the day starts, and the maths assumed after

The Stock page was reporting a loss of a whole day's fuel, every day. On
11 Aug 2026 petrol showed a **loss of 1,652 L** and diesel a loss of 212 L.
Petrol had sold 1,683 L the day before and diesel 207 L. Not a coincidence:
the books were being asked the wrong question.

The pump dips the tanks **first thing in the morning**, before the pumps are
switched on, and records that dip against the same day — at the same sitting
as yesterday's nozzle readings. So a dip dated the 11th measures the tank at
the **close of the 10th**. `calculate_expected_stock` assumed the opposite, and
subtracted the 11th's sales — nothing yet, the day had barely begun — instead
of the 10th's. Every morning dip was compared against a book figure that still
had yesterday's fuel in it.

Corrected, the two dips whose timing we can actually vouch for read **+31 L**
on petrol and **−5 L** on diesel. The pump had been measuring itself accurately
the whole time.

`check_date` keeps its meaning — the day the rod went in, which is what the
person recording it knows. A new `taken` column ('morning' / 'evening') says
when, and **`books_date` is generated from the two**: the trading day the dip
closes, and what every gain/loss figure is now computed and reported against.
Existing rows default to morning, because that is the pump's routine; nothing
was re-dated. Migration **039**.

A second unique index on `(tank_id, books_date)` was added beside the existing
one on `(tank_id, check_date)`: an evening dip on the 10th and a morning dip on
the 11th are two measurements of one moment, and the monthly report would count
both.

### `expected_stock` was written once and never looked at again

Found while proving the first. The stored figure was a snapshot taken the
moment the dip was saved, and `gain_loss` is a generated column off it — so
anything entered _afterwards_ for an earlier date left it permanently wrong,
with nothing on screen to say so.

It had already happened. The dips for 3–8 Aug were back-filled on the 11th in
**newest-first order**, so every one of them took its baseline from the 2 Aug
dip instead of the day before it, and all six landed on the same phantom "gain
of about 3,300 L". Nothing was wrong with the fuel — the rows were computed
against a baseline that was superseded a minute later.

`expected_stock` is now **recalculated from history by trigger**, exactly as
`tanks.current_stock_litres` already was, and for the same reason. Four
triggers feed it: deliveries and readings are what happen _between_ dips, a dip
is the baseline for the next one, and a tank's opening stock is the baseline for
the first. The dip trigger is deliberately `after update OF` named columns —
the recalc writes `expected_stock`, and an unqualified trigger would call
itself.

Both derived columns joined the activity log's ignored list, so a day's
readings no longer credit whoever typed them with "changing" a dip taken last
week.

### The dashboard's tank stock ignored the date on screen

Reported separately: _"the tank stock on the dashboard is always the same as
today's no matter which day I am visiting"_. True, and unrelated to the above.
The card was rendering `tank.current_stock_litres` — a single cached number
meaning _right now_ — while `get_daily_summary` had always returned a per-date
`expected_stock` right beside it. One word. The tanks were the only block on
that page that ignored the date banner above them.

The "no dip recorded" link now opens the **next** morning's Stock page, since
that is the dip that closes the day being looked at.

### Correcting a dip

There was no way to fix a mistyped rod reading, and a dip is the baseline every
later figure is built on — so a wrong one is wrong for every day after it, not
just its own. The owner now gets **Clear this dip** (`<ConfirmAction>`, trash
icon, same as a purchase) and re-enters it. No edit form: a dip is two figures
and a note, so re-entering is no slower, and it keeps one code path for what a
dip is worth rather than two that could drift.

### How it was verified

The whole migration chain 001→039 was applied to a throwaway local Postgres 16
with a small `auth` shim, then seeded with the pump's real August figures, then
exercised: dips inserted in the scrambled order production really used, a
reading deleted and typed back, a dip deleted, a late delivery added, a
duplicate `books_date` refused. Deleting the 10th's reading reproduced the
**exact −1,652 L** the app was showing, and typing it back returned +31.12 —
which is the bug and its fix in one assertion. The activity log stayed silent
throughout.

### What this did NOT fix, and is data rather than code

Two things surfaced once the arithmetic was honest, both in days back-filled
from paper on the 11th and both for the owner to check against the register:

- **1 Aug looks crossed.** The tank opening stocks are petrol 854 L / diesel
  5,556 L; the dips recorded for 1 Aug are petrol 5,556 / diesel 854. Diesel
  cannot go from 854 to 4,720 overnight with no delivery, so the pair appear to
  have been entered into the wrong tanks.
- **8 Aug repeats 9 Aug exactly** — 5,533 and 2,337 on both days, for both
  tanks — which reads as a copied row rather than two measurements.

**Clear this dip** exists partly so these can be corrected now.

### The first dip was calling a typo a gain

Follow-up, once the timing fix was live: 1 Aug still showed _"Gain of 4,702 L"_
in green on petrol and the same loss on diesel.

The first dip on a tank has no earlier dip behind it, so
`calculate_expected_stock` falls back to the tank's **opening stock** from
Settings. That figure was _typed_, not measured — so a difference between it
and the first rod reading is usually two numbers disagreeing, not fuel that
moved. Rendering it in green as a gain says the opposite.

The first dip per tank is now named as such and coloured amber rather than
green/red, in the tank card and the history table: **"4,702 L away from the
opening stock"** and **"vs opening stock"**, with a note saying the baseline was
typed and to check it before reading the difference as fuel. Derived in the page
from the smallest `books_date` per tank — `getStockChecks()` is already uncapped,
so it needs no query and no column.

The wording deliberately stops short of "this is not a gain". If a pump sets its
opening stock and only dips a week later, real trading sits between the two and
the difference _is_ partly genuine. What is always true is that the baseline was
typed rather than measured, so that is what it says.

And the underlying figure was, in fact, a typo: working back from the 2 Aug dip,
diesel really held ~5,052 L and petrol ~1,408 L at the close of 31 Jul. The
Settings openings (5,556 / 854) are close to both. The dips as entered
(854 / 5,556) are ~4,200 L out on each — **the two tanks' readings had been
entered into each other's cards.**

## Stat tiles became their own raised cards, and customers got avatars

The owner sent screenshots of a MUI dashboard template he liked and asked for
the same feel: individually raised stat cards, a coloured trend pill instead
of plain sub-text, and an initials avatar beside each name in a list. The data
and every server call stayed exactly as they were — this is a rendering pass
on `StatTile`/`StatGrid` and the Customers table only, not a new feature.

**`StatTile` is now its own `.card`.** It used to be a cell inside one shared
card with 1px hairline dividers between tiles (`StatGrid` painted the dividers
by giving the grid a coloured background and gap-px). Four cells fused into one
slab read as a single block; four separately shadowed cards read as four
things to check off one at a time against the drawer, which is closer to how
the page is actually used. `sub` (the small caption under the figure, e.g. "23%
of takings") now renders as a rounded pill tinted by `tone` — brand-green for
`positive`, red for `negative`, grey for `default` — with a small filled
triangle for the two directional tones. This is the same information as the
plain grey line it replaced, just legible at a glance.

**`StatTile` grew an optional `icon` prop.** Passing an icon name (from
`Icon.js`) switches the tile to a horizontal layout — the icon in a tinted
ring at the left, label and figure stacked to its right — the shape the
reference screenshot used for its stat row. Left off, which is every existing
call site except the two on Customers, the tile keeps the plain label-over-
figure stack. This was deliberately opt-in rather than applied everywhere:
half the tiles in this app (litres sold, cash, credit) have no icon that
actually means anything, and forcing one on would be decoration standing in
for a real cue, which `docs/UI_CONVENTIONS.md`'s icon rule already warns
against.

**Customers got an initials avatar**, a coloured circle carrying the first
letter of the name, on both the active and the removed-customers tables.
`app/_lib/customer-avatar.js` picks the colour from a small hash of the
customer's id — not `Math.random()`, which would give a name a new colour on
every reload and read as a bug rather than a feature. Deterministic-per-id is
the "random" that was actually wanted: assigned once, stable forever after,
and one more thing besides the name itself that helps the owner spot a
regular in a long list. (An emoji-face version was tried first per an earlier
version of the same request and replaced with initials once asked for — the
hashing approach carried over unchanged, only the rendered glyph changed.)

**Verified** by rendering both components with realistic fixture data — five
customers with PKR six-figure balances, one over its credit limit, one in
credit — at 1100px and 400px. Screenshotted rather than just measured: the
pill sub-text and the icon ring both had to be checked for wrapping at the
phone width, and the "Rs 4,386,211 never wraps" rule from the type-scale
section applies to the new pill exactly as it did to the plain text it
replaced.

## One Material UI icon, and what it actually cost

Follow-up to the stat-tile restyle above: the owner asked specifically for a
Material UI icon on the Customers "Total outstanding" tile. `StatTile` grew
an `iconNode` prop — a rendered node, sized already — that takes precedence
over the existing `icon` (name-from-`Icon.js`) prop, so this one tile could
differ without teaching the shared icon set about a package the rest of the
app deliberately does not use (see `Icon.js`'s own comment on why there is no
icon library here).

**"Just one icon" turned out to be four packages.** `@mui/icons-material`
icons are components built on `@mui/material`'s `SvgIcon`, and `@mui/material`
itself needs `@emotion/react`/`@emotion/styled` as peer dependencies to
render at all — there is no way to import a single MUI icon without all
three riding along. Confirmed this with the owner before installing rather
than assuming "icons only" was actually one package. No MUI theme or
`ThemeProvider` was set up; the icon is used exactly once, styled with
`sx={{ fontSize: 20 }}` to match the 20px the rest of the icon set already
uses and inheriting `currentColor` from its ring the same way.

## Every icon migrated to Material UI

Follow-up to the single MUI icon above: the owner asked for the whole icon
set to move to Material UI, not just the one Customers tile, plus icon
rings added to the stat tiles across the rest of the app that didn't have
them yet (Dashboard, Readings, Lubricants, Reports, Company Assets).

**`Icon.js` kept its exact public shape.** Every one of the ~30 call sites
across the app (`AdminSidebar`, `DateNav`, `Pager`, `GuideFlow`,
`ReadingForm`, the Guide's bilingual content data, `CompanyAssetForm`'s
category picker, …) still writes `<Icon name="..." className="h-5 w-5" />`
unchanged. What changed is entirely inside `Icon.js`: the old file exported
a `PATHS` map of name → hand-drawn `<path>` JSX rendered inside one shared
`<svg>`; the new one exports a `COMPONENTS` map of the same names → MUI
Outlined icon components. Every existing name kept its old meaning (the
comments explaining _why_ a name looks the way it does — the wrench for
Machinery, the briefcase for Assets — carried over to the new file), so no
caller had to change what name it asks for.

**Sizing needed a wrapper, and this was the one real gotcha.** The old
`<svg className="shrink-0 h-5 w-5">` sized itself directly off the passed
Tailwind classes. MUI's `SvgIcon` sizes itself in `em` via its own
Emotion-generated CSS class, and Emotion injects its `<style>` tags at
runtime — which can land _after_ Tailwind's build-time utilities in the
document, and when two classes of equal specificity disagree, the later one
in the stylesheet wins. In practice this meant `className="h-5 w-5"` on the
icon directly was not a reliable way to size it; some icons could render at
MUI's own default 1em/24px regardless of what was asked for. The fix:
`Icon` now renders `<span className={className}>` (a plain sized box) with
the MUI icon inside stretched to `style={{ width: '100%', height: '100%'
}}` — an inline style, which always wins the cascade regardless of
injection order. Every icon in the app is sized by its wrapper span now,
not by the icon component itself.

**Colour needed no change.** MUI's `SvgIcon` fills with `currentColor` by
default when no `color` prop is passed, the same mechanism the hand-drawn
set used — so every existing `text-*` class already controlling an icon's
colour (the amber warning triangle, the brand-green check, a red delete
icon) kept working without being touched.

**Stat tile icon rings, applied to every existing stat row.** Each icon was
picked for what the figure actually is, not decoration: a fuel pump for
litres sold (Dashboard, Readings), a price tag for Sales, a card for On
credit, a wallet-with-coins for Cash, a delivery truck for Stock bought, a
trending-up arrow for Profit. Company Assets' "Biggest holding" tile reuses
the _same_ per-category icon (`vehicle`/`machinery`/`property`/…) that
`CompanyAssetForm`'s category picker already shows, rather than a new
generic icon, so the tile tells the reader which category actually won
rather than just decorating the word.

**`StatTile`'s icon-ring layout grew a fix while wiring this up.** The
Reports "Profit" tile's `sub` — "sales − stock bought − expenses" — used to
sit in the text column beside the icon ring, and wrapped to three cramped
lines there once the ring took width away from that column. `sub` now
renders on its own row below the icon+figure, spanning the full card width,
so the same text wraps at most once. Caught by rendering the fixture data
and screenshotting, not by a DOM measurement — see the project skill on why
that check matters.

**Verified** the same way as the earlier passes: a disposable devcheck route
(deleted before commit) rendering the full sidebar icon set at 24px, the
chevron rotations used by `Pager`/`DateNav`, and every page's stat row with
its new icon, screenshotted at 1100px and 400px.

## Every MUI icon was hydration-broken, and the fix was one provider

The owner hit a hydration mismatch on `/admin/readings` right after the
Material UI icon migration landed — React's error named `ChevronRightOutlinedIcon`
specifically, but the cause was not specific to that icon at all.

**The actual cause.** MUI's icons render through `SvgIcon`, styled by
Emotion. Emotion normally injects a `<style data-emotion="...">` tag next to
whatever it styles, and on the server that has to be collected and streamed
down as part of the same response — otherwise the server-rendered HTML has
no style tag (styles get generated but never flushed to the response) while
the client's own first render generates and inserts one, and React sees the
mismatch as soon as it tries to reconcile the two. `app/layout.js` had no
such collection in place: the whole MUI migration had been visually
verified by rendering pages and screenshotting them, which caught wrapping
and sizing bugs but not this, because a plain server render followed by a
Playwright screenshot never distinguishes "the server sent the right HTML"
from "the client silently regenerated it after a hydration error" — both
end up looking identical in a screenshot. The bug needed something actually
checking the browser console, which the earlier verification passes had
not done.

**The fix.** `@mui/material-nextjs`'s `AppRouterCacheProvider`
(`v16-appRouter`, matching this app's Next.js version) now wraps `children`
in `app/layout.js`. It runs Emotion's cache through Next's
`useServerInsertedHTML`, so styles generated during the server render are
flushed into the same response instead of appearing only after client-side
hydration. Confirmed both ways: the browser console is silent where it
previously threw a hydration error, and the raw SSR HTML (`curl`) now
contains a `data-emotion="mui ..."` style tag inline, which it did not
before.

**What this means for anything else that reaches for MUI later.** Any MUI
component styled through Emotion needs this provider present, not just
icons — `Icon.js` only surfaced it first because it is the one place MUI
is used today. If a hydration error names a Material UI component,
check `AppRouterCacheProvider` is still wrapping the tree before looking
for a bug in that component itself.

## Banking joined the shared stat tiles, and its account cards separated

The Banking page had been left behind by the stat-tile restyle: its three
headline figures were a private `Stat` component and a hand-rolled
`grid gap-px bg-ink-200` strip - the exact fused-slab shape `StatGrid` had
already moved away from - and its account cards ran name, balance and the
two paid-in/paid-out figures together as one block of text.

- **The three totals now use the shared `StatGrid`/`StatTile`**, with icon
  rings like every other page: a bank for Balance now, cash for Paid in,
  a wallet for Paid out. The page's own `Stat` function is deleted; there
  is no longer a second implementation of a stat strip anywhere in the app,
  which was the whole point of extracting `AdminStats` in the first place.
  `StatGrid` gained a `columns={3}` option for this - it previously
  understood only 2 and 4.
- **Account cards carry the same tinted icon ring as a stat tile**, so a
  card reads as a sibling of the figures above it rather than as an
  unrelated block, and the account name moved up from `text-sm` to
  `text-base` (it is the card's heading; it was the same size as the bank
  name beneath it).
- **Paid in and paid out became tinted panels** rather than two bare figures
  under a hairline rule. They were 12px labels over 12px figures, with the
  green/amber colour doing nearly all the work of telling the two apart -
  now each has its own edge, the figure is `text-base`, and the labels sit
  at the app's 12px floor rather than below it.
- **The In/Out columns in the transactions table gained direction arrows**
  (`moneyIn`/`moneyOut`, an arrow coming in and one going out). Those two
  columns were previously identical in shape and told apart only by which
  one had a figure in it and what colour it was - green against amber,
  which is exactly the colour pair the icons rule in
  `docs/UI_CONVENTIONS.md` says must never be the only cue.

## Colourful stat rings, and every button became Material UI

Two requests together: the icons "look boring", and the buttons should be
Material UI so they look more professional.

### The rings are coloured by meaning, not by tone

Every icon ring was the same grey, which made a row of four tiles read as
four identical objects — the ring was taking up space without doing the one
job it has, which is letting the reader pick out the tile they want without
reading the labels. `RING_COLORS` in `AdminStats.js` now maps each icon name
to a colour: green for cash and profit, amber for credit and expenses, blue
for fuel, violet for oil (already lubricants' badge colour), teal for stock
on the shelf, red for a warning.

**Colour follows what the figure IS, not whether it is good news.** `tone`
already colours the figure and its pill, so a loss shows as a red number
inside a green "profit" ring. Driving both from `tone` was the obvious
alternative and is wrong: it says the same thing twice, and it puts every
tile in a bad month into the same red, which is exactly the sameness the
colour was added to fix. Unlisted icons fall back to neutral slate so a new
one is never accidentally loud.

### Buttons

`app/_components/ui/Button.js` wraps MUI's `Button` and maps the app's three
intents (`primary` / `secondary` / `danger`) onto MUI variants, so call sites
still name an intent rather than a Material recipe. All 79 usages across 35
files were migrated and the `.btn-*` classes deleted from `globals.css` —
leaving them would have meant two button systems, which is what this
replaced.

**The tap targets got smaller, and that was a deliberate, informed choice.**
The old classes were `py-3`, about 50px, chosen because this app is used on a
cheap tablet and pressed with a thumb. MUI's default medium Button is about
36px. The trade was put to the owner explicitly — MUI's default look means
smaller targets, uppercase labels and Material blue instead of the brand
green — and the owner chose MUI's defaults as-is. `size="large"` in
`Button.js` is the one-line reversal if the smaller target turns out to bite
in the yard.

Two hand-rolled buttons folded into the shared component along the way. The
more interesting one is Clear this day, which had written its styles out by
hand *specifically* so that with nothing to clear it went grey rather than a
faded red — "unavailable at a glance, not a warning". MUI's own disabled
state is that grey, so the reason for the special case disappeared with the
migration.

### What the verification caught, and what it nearly missed

`npm run build` passed with a `Button is not defined` bug live in
`Pager.js` — the import pass had run before six files were hand-edited, and
a missing identifier inside a client component is a runtime error, not a
build one. It surfaced only on actually loading the page. Worth remembering
next time a mechanical migration "builds fine": for this class of change the
build is close to no evidence at all.

Verified by rendering the real dialog components (Customer, Asset, Bank
account, Clear day) and clicking each trigger open, plus `/admin/login` as a
real route, checking the browser console was clean at each step. The `+`
glyph in "+ Add an asset" rendering flush against its label — MUI only
spaces its own `startIcon`, not ordinary children — was found this way and
fixed with a `gap` in the wrapper.

## Readings: the card became the unit

The owner's verdict on the entry screen was that it looked "stacked and
boring", which it did, and the screenshot made the reason plain: six
identically-shaped full-width cards down the page, each the same height and
the same weight, with the unit heading a small caption floating above every
pair.

**One card per unit, nozzles as rows inside it.** A unit is a physical pump
standing on the forecourt with two nozzles bolted to it. The flat list gave
that nothing to be — an earlier pass had already tried to carry the grouping
with spacing alone (32px between units, 12px inside one), and spacing turned
out not to be enough against six identical slabs. Making the card *be* the
unit gives the page three objects to work through instead of six, and lets
the rows get shorter, since they no longer each need their own card edge and
shadow.

**The unit header carries a progress bar** beside the existing "1 of 2
entered" chip, green once the pump is finished, so a completed unit is
skipped without reading its rows. The bar and the words say the same thing —
the bar is the glanceable half, not the only carrier, which is the same rule
the tank-fill bars on the Dashboard already follow. It is hand-rolled to
match those rather than pulled from MUI: the visual result is identical and
the app already had the pattern.

**The unentered row is now the tinted one, and this is the real fix.** The
page is opened every evening to answer one question — what is left to enter —
and a finished nozzle looked exactly as loud as one still waiting: same
white, same size, same weight. Rows still to do wear a soft amber wash, the
same amber the Enter chip already wears, so no new colour language was
invented and the remaining work is what the eye lands on.

### The fuel colour nearly disappeared silently

Moving the fuel accent from a rule across the top to one down the left edge
looked correct in the code and rendered as a plain grey edge. `color.accent`
is `border-t-[#38727F]` — a top border *colour*, so pairing it with
`border-l-4` sets a 4px left border in the default grey and paints the fuel
colour on an edge that has no width. The fix is `color.border`, which is the
same hue with no side bound to it. Worth knowing because nothing errors and
the class name reads as if it should work; it only showed up in a screenshot.

## The button migration broke six pages, and the build said nothing

The owner hit *"Functions cannot be passed directly to Client Components"* on
the customer page, and then, separately, *"page not found"* when clicking a
customer from the list. Both were the same bug.

**The cause.** The Material UI button migration rendered a
button-that-navigates as `<Button component={Link} href=...>`. `Button` is a
client component, `Link` is a function, and a function cannot cross the
server/client boundary — so every *server* component doing this throws at
render time. Six did: the customer detail page, the guide, daily sales,
`DateNav`, `Pager`, and the customers list by way of `Pager`. The customer
detail page managed to contain the bug twice, once itself and once through
the `Pager` at the bottom of its ledger.

**Why it presented as a 404.** Clicking a row is a client-side navigation,
which fetches the RSC payload for the target route. That payload failed to
generate, and a failed payload lands on not-found — so the visible symptom
was "page not found" rather than the actual error, and it only happened when
*clicking* rather than loading the URL directly.

**The fix** is to stop passing the component at all. `<Button>` now takes
`href` (a string) and `pending` (a boolean), both of which serialise, and
resolves `Link` or `PendingLink` on the client side of the boundary itself.
`component` is still accepted for the few client-side callers and for
`component="a"` — a string, so it crosses fine — which the Excel download
needs so the browser handles it rather than the client router.

### The verification lesson, for the third time this branch

`npm run build` passed with all six pages broken. The build compiles and
prerenders; it does not execute an auth-gated dynamic route, so the whole
class of "server component hands something unserialisable to a client
component" is invisible to it. The same branch had already shipped a
`Button is not defined` this way.

What actually caught it was a devcheck page deliberately written **without**
`'use client'` — a real server component rendering `Button`, `DateNav` and
`Pager` — and a Playwright run that *clicked* a link rather than loading the
URL, reproducing the client-navigation path. The fix was then confirmed the
only way worth trusting: by reintroducing the bug and checking the test went
red (it did, with the owner's exact error), then removing it again.

## Petrol went blue, diesel went orange

The owner asked for a pair his father cannot mix up. The mistake being
designed out is concrete: a closing reading typed against the wrong nozzle,
which poisons every later day because each opening comes from the day before.

**Blue against orange, dark against light.** The old pair — the owner's own
teal `#54A2B3` and yellow `#FCFC62` — worked, but only just. They sat 2.67x
apart in luminance, and the yellow was near enough to lubricant's gold to blur
a purchase list. The new pair is 4.48x apart, on opposite sides of the colour
wheel, and differs in a third way as well: petrol's fill is dark and carries
WHITE letters, diesel's is light and carries DARK ones. Three independent
cues, so the pair survives a dim office, a failing screen, and colour-vision
deficiency — blue against orange does, where red against green would not.

The module's own rule was the thing to respect here, and it nearly got broken:
the first candidate was a mid blue against a mid orange, which is a fine-
looking pair and 8.3:1 against 7.9:1 — i.e. the same weight, exactly what the
owner rejected once before as "they both look the same, both are dark". The
lightness gap is checked now rather than assumed, and the numbers are written
into `fuel-colors.js`.

**`border` is a step lighter than `onWhite`.** At text-grade darkness the 8px
nozzle rail read as near-black for petrol and as brown — close enough to the
app's red to look like a warning — for diesel. A rule only has to be seen; text
has to be read, so the two jobs take different values of the same hue.

**Two things had to move out of amber**, because diesel now owns orange and two
warm colours competing on one row is exactly the confusion this was meant to
end: the readings "Enter" chip (now neutral slate) and the unit progress bar
(now green whether part-done or complete). The nozzle row's state tint
inverted as a result — a finished row settles into a faint green matching the
check in its unit header, and a row still to enter stays plain white and stands
out against them. The colour budget on that row belongs to the fuel.

**A corner of the app was still on the old colours and nearly stayed there.**
The customer detail page's "Fuel taken in total" tiles hard-coded `bg-sky-50`
and `bg-amber-50` instead of calling `fuelColor()`, so they were invisible to
a change made in the module — the exact drift that caused the module to be
written in the first place. Found by grepping for fuel names next to colour
classes rather than by looking, which is the only reliable way to find this.

**Verified** by rendering all three badges together, the filled bands, the
Stock dip boxes (the other surface where typing into the wrong one costs
something) and the full readings sheet with both fuels interleaved, at 1100px
and 400px.

## The Readings unit header wears its fuel

The header strip had a wide empty middle and said nothing the rows below did
not already say. It now carries the unit's fuel as a filled band - pale while
there is still a nozzle to enter, filled dark once the pump is finished.

**Hue says which fuel, lightness says whether there is work left.** Two
questions on two channels, so neither has to borrow the other's. That needed a
new pair of tokens in `fuel-colors.js` - `soft` (pale tint, own dark text) and
`strong` (dark relative, white text) - because `solid` could not do the job
alone: for diesel `solid` IS the light band, so an emphasised header built
from it would have come out paler than the quiet one.

Everything inside the band takes its colour from the band rather than being
coloured itself - `currentColor` for the icon, white-alpha for the chip and
the progress track - which is what lets one pair of classes serve both a pale
band with dark text and a dark band with white text. The progress fill is the
only exception: green on a pale band, white on a filled one, because green on
dark rust is a third hue fighting for a 6px strip.

**A unit with two different fuels falls back to neutral.** A dispenser is
normally plumbed to one tank and every unit at this pump is single-fuel, but
the schema does not require it, and a unit selling both would be mislabelled
by either colour. Rendered that case deliberately in the check rather than
assuming the real data would never produce it.

## The finished unit's progress bar was reading as a stray white rule

Reported as "the progress bar looks white even when filled". It was: on a
filled dark header a 100% bar is entirely fill, with no empty track left to
contrast against, so it stopped looking like a bar and started looking like a
white line left behind by mistake.

The bar is now only rendered while a unit is unfinished. A finished one is at
100% by definition, so the bar was carrying no information there - the filled
band, the check icon and "2 of 2 entered" already say it three times over. The
general rule, which is worth remembering the next time a progress indicator
goes on a coloured surface: **show a bar only while there is progress left to
show.**

The gap between unit cards also went from 20px to 32px, so the three pumps
read as three separate things to work through rather than one continuous
stack.

## Colour audit: eleven hues down to two palettes

The app had drifted to roughly eleven hues. Counting the Tailwind colour
classes across `app/` found ink 672, brand 144, red 120, amber 104 - a
coherent core - and then sky 17, violet 12, indigo 8, teal 6, cyan 4, rose 2,
orange 1, plus MUI's own blue on every button. The stragglers were the app
looking home-made.

It now has **two vocabularies that never overlap**: chrome (green, amber, red,
slate) for what the app is doing, and the fuels (blue, orange, gold) for which
fuel something is.

### MUI's stock palette could not be used

Its primary is a blue and its warning an orange - exactly the two colours the
fuels had just been given so the owner's father cannot mix up a nozzle. Using
them would have put a blue button beside a blue Petrol badge on the Readings
screen and spent the cue on chrome. So `AppTheme.js` themes MUI to the app's
own palette instead: green primary, red error, amber warning.

That also closed a split the app already had. Buttons were MUI blue while
links, success messages, "Entered" chips and every positive figure were brand
green - two primaries, and the blue one belonged to neither the app nor the
fuels.

**Primary is brand-700, not brand-600.** MUI puts white text on a contained
button, and white on brand-600 (#059669) is 3.77:1, under AA - which the old
`.btn-primary` had been shipping unnoticed since it used the same fill.
brand-700 is 5.48:1. Confirmed against the rendered button rather than the
source: computed style reported `rgb(4, 120, 87)` on white.

### What the decorative hues were actually doing: nothing

Three places used colour only to tell items apart, and all three already had a
stronger cue:

- **Asset categories** had five hues and five distinct icons - a car, a
  wrench, a building, a monitor, a tag. Shape survives poor light and colour
  blindness, which is the argument `Icon.js` already makes for having icons at
  all, so the hue was a weaker copy of what the icon said. Neutral chips now.
- **Customer avatars** had seven hues; the initial is what identifies the
  customer. Four tints of slate and green now, enough to keep a list from
  looking uniform.
- **Stat tile rings** had seven hues, one per KIND of thing - fuel blue, oil
  violet, stock teal, banking indigo. Two of those were the fuels' own colours,
  so a ring on "Litres sold" quietly competed with the badge. They now carry
  meaning only: green money arriving, amber money owed, red look at this,
  slate otherwise.

The rule that came out of it: **colour a thing only when the colour adds
meaning its shape does not.**

### One colour was left alone on purpose

`CashCreditChart` uses green and violet, which looks like exactly the kind of
stray hue this audit was removing, and the obvious fix was to make credit
amber to match the "money owed" ring. The file says not to: that pair was
chosen with a palette validator because green/violet separates for red-green
colour blindness (deutan dE 25.2) where green/amber does not. Consistency does
not outrank being readable. It is now marked as a deliberate exception so the
next audit does not spend the same half hour rediscovering it.

Two stale references also went: a Dashboard comment still describing diesel as
`#FCFC62` yellow, and a chart comment calling the fuel pair "navy/yellow".

## Company Assets reach the monthly workbook

The owner opened the Excel download expecting the month's whole record and
found Company Assets missing - it was the one section of the app with no
column in the export. Three layers had to learn about it: the RPC, the
template, and the writer.

**`040_company_assets_in_the_export.sql`** adds `asset_rows` and an `assets`
summary to `get_month_export`, restated in full because plpgsql cannot replace
part of a function body - the same reason 019 and 030 are full copies.

**The Assets sheet is the only one that ignores the report's month.** It
carries the whole register with an `in_month` flag rather than just that
month's purchases. An asset register answers "what does the business own", and
most months the pump buys nothing at all - a month-scoped sheet would be empty
in those months and read as a bug rather than as a fact. "Bought this month"
is a column instead, so the sheet still filters down to the month when that is
the question. `bank_accounts` already set this precedent by carrying standing
balances beside the month's movements.

**Not counted in profit, and the Summary block says so.** Money spent on a
delivery bike is not a cost of trading the way a fuel delivery is - the pump
still has the bike - and the app has never counted it as one. The figure
without that sentence is one somebody subtracts by hand, so the block carries
"Not counted in profit above" the way the BANK block carries its own note.

### What the readback caught

The sheet was verified by generating a real workbook from fixture data and
reading it back with openpyxl, not by trusting the code. Two things came out
of that which review would not have:

- The Category column was printing the raw Postgres enum (`vehicle`) where the
  app shows `Vehicle`. It now maps through `ASSET_CATEGORIES`, the same list
  the picker and the page use, rather than capitalising by hand.
- Applying that mapping, the edit landed on the **Expenses** sheet instead -
  both had a bare `row.category ?? ''` and the first match won. Expense
  categories are free text and would have been silently mangled by an asset
  enum lookup. Caught only because the readback showed Assets still lowercase.

The renumbering trap in the template was checked rather than assumed: after
regenerating, every existing sheet still maps to its original `sheetN.xml` and
the three chart parts are untouched. Assets is `sheet10.xml`, appended last.

## Reports headings, a shorter note, and the Expenses page

Three things the owner asked for after using the pages for real.

**The section headings were not prominent** - and the reason was that
`.section-heading` and `.figure-label` were nearly the same style. Both small,
uppercase, tracked, ink-600, so "Lubricants" over a row of tiles was set like
the "SOLD" caption inside one of them. A heading typeset as a caption does not
read as a heading. It is now `text-lg font-bold text-ink-900` and NOT
uppercase; dropping the uppercase does most of the work, since that was the
feature the two shared most visibly. Fixed in the shared class rather than on
Reports, so every page gains it.

**The explanatory note under the tiles was four lines and is now one.** It
explained that profit counts stock bought rather than sold, why a late delivery
flatters it downwards, and that both trades are included - all true, and the
verdict was "too long". Only the first clause changes how a figure is read;
"both trades" was already covered by the Sales tile's own sub-line, which
itemises fuel and lubricants. The full reasoning is in the Guide and on the
workbook's Summary sheet, where there is room.

> Read later: that note was rewritten a second time in **049**, because the
> formula it was explaining turned out to be wrong. It no longer apologises for
> the figure; it shows the working. See "Profit was counting stock bought
> instead of stock sold" near the end of this file.

**Expenses** got the shared stat tiles (it was the last page still rendering
its total by hand), and its by-category list became a real breakdown with
share bars and percentages - a column of figures of different digit lengths
does not answer "which costs dominate" without arithmetic.

Two tiles, not three, and both cuts came from rendering it: a "biggest
category" tile arrived truncated to "salary of haseeb…" because StatTile keeps
its value on one line - correct for money, wrong for free text - and a third
tile repeated the month's total under "counted in profit", which is not a
second fact. That link moved into the first tile's sub-line.

### The category box now remembers

The same screenshot showed why the breakdown was worth so little: most of the
month sat under "Other", and one category was the sentence "salary of haseeb
and pump tea and lunch". The form offered seven fixed suggestions and no
memory, so every entry invented its own wording. `getExpenseCategories()` now
returns what has actually been used, most-used first, ahead of the stock list.

The rule this leaves behind: any free-text field whose values are later
grouped, totalled or filtered should offer what has already been used, or the
grouping quietly becomes noise.

### Where MUI earned its place, and where it did not

`CategoryBreakdown` uses MUI's `LinearProgress`; the tank gauges and the unit
progress bar stay hand-rolled. The distinction is the surface: a FILL gauge
sitting inside a coloured band needs its own track and fill colours against
that band, while a share-of-total bar in a plain list is exactly what
`LinearProgress` is. Worth knowing the app now has both, and which to reach
for.

It is also a server component with no `'use client'` - nothing in it is
interactive, and that is what lets it use `formatPKR` from `helpers.js`, which
reads request cookies and cannot enter a browser bundle. Importing MUI's own
client component from a server one is fine; only the props have to serialise.

## The Sale & Stock Register

The owner's own spreadsheet, brought into the app. He keeps a sheet called
*"Fuel - Daily Sale & Stock Register"*: one row per trading day per tank, with
opening stock, receipts, meter sales, the book stock those imply, the dip that
actually measured the tank, and the difference — and then, circled in yellow on
the screenshot he sent, **the sales and the variance accumulated down the
month, and both as a percentage.**

Those cumulative columns are the point of the sheet, and nothing in the app
could produce them. The Stock page answers "how did the tank do yesterday" and
Reports answers "how did the month total up"; neither answers the question in
between, which is the one that catches a problem. A single day's variance is
noise — a rod reading is a person squinting at a wet stick, and ±30 L on a
5,000 L tank is the measurement, not the fuel. A leak or a theft looks like a
**cumulative** variance that walks in one direction and a percentage that will
not come back towards zero.

Live at `/admin/reports/register`, reached from a button on Reports rather than
from the sidebar, with a banner saying it is a preview — it is deliberately not
a fixed part of the app yet. Everything on it is real data through the same RLS
and the same `requirePageRole` as every other page; "for testing" describes the
design, not the numbers.

### Migration 041, and the one thing that had to be checked

Two RPCs, both `super_admin`-gated the same way every other reporting function
is:

- **`get_stock_register(from, to)`** — one row per tank per day, cumulative
  columns included, computed with a window function. Cumulative means
  cumulative *within the range asked for*, which is what the spreadsheet does
  and what makes the figure answerable: "we are 213 L up over these eleven
  days" is a sentence about a period somebody chose.
- **`get_range_summary(from, to)`** — profit over an arbitrary run of days.
  `get_monthly_report` already answers this and *cannot* be reused: it takes a
  year and a month, not two dates, so it can only ever describe a whole
  calendar month. The arithmetic is copied deliberately, and if one changes
  both change or the two pages start disagreeing about the same days.

**The variance is recomputed rather than read off `stock_checks.gain_loss`**,
and that needed proving before it could be trusted. A register is read across,
so a variance column that did not equal the arithmetic of the columns beside it
would be unreadable however right it was — but the app reports gain/loss from
`gain_loss` everywhere else, and two sources for one number is how books start
disagreeing with themselves. So the derivation was run against every dip the
pump has recorded, 1–11 Aug 2026, petrol and diesel: **all 22 rows exact.** If
they ever stop agreeing, `gain_loss` is the one to trust.

**Opening stock is yesterday's dip, falling back to the books.** A measured
number beats a calculated one — the same rule `calculate_expected_stock` uses
to pick its baseline. After a day nobody dipped there is nothing measured to
use, so it falls back to the book value carried forward. And `books_date`
throughout, never `check_date`: this pump dips in the morning, so the rod that
went in on the 11th measures the close of the 10th. Migration 039 is the story
of what getting that wrong costs.

### What the screenshots changed, which was most of the layout

Four rounds, and every one of them found something a DOM measurement had
already called fine.

**The point of the page was off-screen.** With the sidebar, a 1152px window
leaves the table about 880px and a 1024px one about 750px. Ten numeric columns
fit in neither, so it scrolled inside its card — the app's normal answer — and
scrolled to its natural start the columns on screen were *opening stock* and
*receipts*, with the cumulative block off the right-hand edge at every width
including a phone. A table whose point is invisible until you scroll is a table
that will be read wrong.

The fix is **the date column pinned left and the cumulative block pinned
right**, so whichever way it is scrolled the reader can see which day a row is
and where the running totals stand; the working in between is what slides. New
`.pinned` / `.pinned-left` / `.pinned-right` classes in `globals.css` — the
horizontal counterpart of the sticky heading that was already there, and the
first table in the app to need it.

**The z-index had to live in the stylesheet, and that cost a screenshot to
find.** `.table-scroll thead th` gives every header cell `z-index: 10`, and it
outranks anything MUI's `sx` emits — a class plus two elements against one
class. So the pinned headers, carrying `z-index: 2` from `sx`, were painted
*over* by the ordinary headers they were meant to cover: the cumulative block's
figures appeared under a heading reading "Litres, %, %". The numbers were right
and the heading above them was wrong, which is the worst way for a table to
fail, and no measurement would ever have caught it.

**Two columns came out, because a scrollable region clips at its edge.** The
first render clipped straight through a dip reading — `5,219.(` — which reads
as broken data rather than as more table. The day's sale in rupees went (not
part of the stock reconciliation; the fuel cards above carry the same days'
takings) and so did Total Stock (it is opening plus received, the two columns
to its left, and with deliveries a handful a week it was a verbatim copy of
Opening on most rows). At 1152 the clip now lands in the gutter and only whole
columns hide.

**The pinned columns are sized by the phone, not the laptop.** At 400px they
are very nearly the whole table, and at their first widths they overlapped:
the date rendered as `01 Aug 202`, a truncated year, which reads as corrupt
data rather than as a layout problem. 7 + 6 + 5.5 + 4.25 rem fits 400px.

**`.table-scroll`'s phone bleed had to go on a pinned table.** It is
`-mx-4 px-4` below `sm`, and a sticky offset is measured against the
scrollport's *padding* box — so `left: 0` stopped 16px short of the card edge
and left a strip of ordinary scrolling table showing past the pinned column.
Painting over it with an offset box-shadow was tried and did not work;
`.has-pinned-columns` zeroes the padding instead. The bleed still happens — the
negative margin is what does that — and the cells' own padding gives the end
columns their room.

**And the fuel headings were flush against the paragraph above them**, because
each table had been wrapped in a `<section>` and `.section-heading` carries
`first:mt-0`. Every heading had become its container's first child and lost its
margin. A `<Fragment>` instead: the grouping was decorative, the spacing was
not.

### Material UI, at the owner's request, and what that settled

The page is MUI throughout — `Table`, `Paper`, `TextField`, `Alert`, `Chip` —
and almost none of it is a Client Component. MUI's own components carry their
`'use client'`, so a server component may render them freely; only
`RegisterRange` is `'use client'`, because it genuinely has state. That is the
same lesson `CategoryBreakdown` already recorded, applied to a whole page.

`MoneyTile` duplicates `StatTile`'s shape and type sizes on a `Paper` rather
than mixing the app's `.card` into an MUI page. That is a deliberate temporary
state, and it is noted in the file: if the register graduates from a preview,
the right move is to pick one of the two and delete the other, not to keep
both.

**The range picker is a from/to pair, which `<TrendRange>` deliberately is
not**, and the difference is worth stating rather than looking like a lapse.
The Dashboard's charts answer "how are we doing lately" — the end of the window
is always today and "last 30 days" is the whole question. This page answers
"reconcile these particular days": the month so far, the ten days since a
delivery, one week somebody is suspicious about. A fixed window cannot express
any of those. What it does borrow is everything else — the range cannot be
entered backwards (each end drags the other), cannot be empty, is two
`<select>`s of real days rather than free text, is validated again on the
server, and rides in a plain `method="GET"` form so the URL carries it.

### And then the naming, which one question settled

The owner looked at the finished table and asked, of the totals row, **"what is
these days"**. Four words, and the whole verdict on a label: he did not know
whether it was another day, a total, or something else.

That prompted a pass over every word on the table, and it found more than the
one label:

- **The totals row is now two lines - "Summary" over "01–07 Aug"** - because
  one line cannot do both jobs the reader needs: that this is not another day,
  and which days it covers. "Summary" rather than "Total", because two of the
  row's own cells are not totals: opening stock and the closing dip are the two
  ENDS of the range, and summing every day's opening stock would be a figure
  with no meaning. Calling it a total would promise arithmetic it deliberately
  does not do. The dates sit underneath in ordinary case so the pair does not
  read as one shouted phrase, and the month is stated once because the range
  picker cannot span two.
- **"Variance" became "Gain / loss" everywhere**, which is the real fix. That
  word came in from the owner's spreadsheet, but the app's own vocabulary is
  gain/loss and always has been - `stock_checks.gain_loss`, the Stock page's
  own column heading, and the fuel cards at the top of this very page, which
  already read "Stock gain / loss over these days". The register was the only
  surface in the app using a different word for the same number.
- **"Books" became "Should be".** "Books" is bookkeeping's word for it, not the
  owner's, and the column beside it is "Dip" - so the pair now reads "should
  be 5,223.54, dip 5,219.00" and the gain/loss between them explains itself.
- **"Cumulative" became "Running total"**, which says the same thing without
  the Latin.
- The explanatory note under the tables was updated to name the columns exactly
  as the headings now do. It had said "Books" and "variance" while the table
  said something else, which is how a legend stops being read.

One heading also had to be shortened after rendering it: "Gain / loss that
day" wrapped to two lines and then clipped at the pinned block's edge, showing
as "GAIN / LOSS T" over "DAY". It is just "Gain / loss" - paired against
"Running total" beside it, the contrast already says which is which.

## Readings: inline entry built and reverted, and the cash-up bar that stayed

The owner asked for a complete redesign of the daily entry screen. It is the
most-used page in the app, and `docs/UI_CONVENTIONS.md` already records three
separate designs that were built here and reverted — so this started by reading
that history rather than by drawing. Nothing reverted was reintroduced: no
day-completion strip, the unit-as-card grouping kept, the day banner untouched.

**The diagnosis was the flow, not the paint** — and half of it was right.
Each nozzle opened a dialog, so an evening's work — six numbers — cost six open
/ type / save / close round trips, the page covered over each time by the thing
it had just launched. The giveaway was that the dialog had grown its own running
total panel: the page's own figures were unreachable from inside the task.

**The inline rebuild was then reverted at the owner's request** — *"model window
was better"* — and the reasoning is written up in `docs/UI_CONVENTIONS.md` so it
is not attempted a second time. Short version: the round-trip count was a real
cost, but what the dialog buys this particular task is **one nozzle on screen
and nothing else**. A reading typed against the wrong nozzle is the mistake the
entire screen is designed around; expanded in place, the row being typed into
sits in a column of five near-identical siblings. The dialog's cost is
navigation, and its value is that there is nothing else to type into by
mistake.

**The cash-up bar survives the revert and is the part that stayed.** It solves
the same complaint — the page's totals being unreachable from the bottom of a
six-row page — without touching where the entry happens.

What follows describes the inline version as built, in the past tense, kept
because it is the record of what was tried. **None of it is in the app**; the
cash-up bar section after it is.

### The row opened where it stood

Tapping a nozzle expanded it in place. Type the closing reading and the
litres and the value compute under it as you type, exactly as the dialog did,
because it is the same `EntryForm` — none of the hard-won validation moved. All
of it still applies: the overlap check that stops a day being counted twice
(migration 026), the gap checkbox (027), the chain warning, and the refusal when
credit slips exceed what the nozzle sold.

Around it:

- **The chip became the way out** — an open row read "Close" — and the form
  grew a Close beside Save, since in a tall panel the chip has scrolled off.
- **The panel was unmounted when closed, not hidden.** That is what discarded a
  half-typed closing reading rather than letting it reappear against a day the
  reader had since navigated away from.
- **The collapsed row was one line instead of a four-column grid.** It had spent
  two labelled columns on the opening meter and the rate and a third of its
  width on the sentence *"Tap to enter the closing meter reading."* — printed
  six times down a page where every row already carried an Enter chip and a
  chevron saying the same thing. The instruction is gone because the input it
  described was in the row. The labels were not: "Meter starts at
  1,988,061.61" is still a labelled figure. **This came back with the revert** —
  the sentence is defensible again now that tapping really does open something
  else.
- **And that line disappeared when the row opened**, because the form beneath
  stated both figures again with proper labels.

All six nozzles fitted on one screen at a laptop width, where three and a half
do behind the dialog. That was the gain, and it did not outweigh having five
near-identical siblings around the row being typed into.

### A cash-up bar that only appears when it is needed

The four stat tiles stay at the top of the page, at the owner's choice. But the
last nozzle is a long way below them, and the question being answered while
typing into it — *does this match the notes in the drawer* — is a question about
the day's total, asked at the point furthest from where the day's total is.

`ReadingsCashUpBar` is a slim dark strip pinned to the bottom carrying the same
figures, and it shows itself **only once the tiles have scrolled out of view**,
watched with an `IntersectionObserver`. So the totals are on screen exactly once
at any moment — "say it once" honoured rather than broken — and they are
reachable from inside the task without scrolling back up. It stays hidden
entirely until something is entered, since on a fresh day it would be a strip of
"Rs 0" following the reader down a page they have not started.

### What rendering it caught

- The **spacer under the page had to be sized from the phone, not the laptop**.
  The bar is 76px at a laptop width and **100px at 400px**, where it wraps to
  two lines; sized to the laptop, the last nozzle's Save button sat underneath
  the bar on the device the app is actually used on.
- **Litres now drop off the bar at narrow widths.** All four figures wrapped to
  three lines at 400px — about 90px of a short screen, permanently, over the row
  being typed into. Cash and credit answer the drawer question; litres do not.
  A container query rather than `sm:`, since the bar is inset by the sidebar.
- A note for the next person screenshotting this page: **a full-page Playwright
  screenshot renders a `fixed` element at its viewport position**, so the bar
  appears stranded in the middle of the page in every `fullPage: true` capture.
  It is an artefact of the capture, not a bug. Verify a fixed element with a
  normal viewport screenshot plus a computed-style read, which is how the
  show/hide behaviour here was actually confirmed.

## The dashboard, in Argon's clothes — and a money figure that never fitted

_"find me a minimal dashboard, no blacks" → "go ahead, build it with argon
style"._ The owner went looking for a new dashboard design; what came back is
mostly a craft change, plus one real bug that the craft change exposed.

**Where the reference came from, since it is not reproducible from here.**
Behance, Dribbble, Figma and creative-tim.com are all blocked by this
environment's network egress policy. The npm registry is not, and Creative Tim
publish their templates there under MIT, so the four dashboards actually
compared were pulled as tarballs, extracted, served on localhost and
screenshotted. Argon Dashboard 2 won on being light, black-free and closest to
what this app already does. Now UI was rejected outright: its orange sidebar
and blue chart header are diesel and petrol spent on chrome.

### What was worth taking

- **A softer, lower, wider shadow on `.card`** — `0 20px 27px 0 rgb(0 0 0 /
  0.05)` in place of `shadow-md`, with `rounded-2xl`. `shadow-md` is a tight
  contact shadow (two layers at 10% within 6px), which reads as cards pressed
  flat against the page and gives a grid of them a ruled, gritty look. The
  borrowed one separates card from canvas by *height* rather than by contrast.
  It has to stay faint: on a cheap tablet in poor light a heavier shadow turns
  into a grey band along every card edge and starts competing with the
  hairline dividers inside the card.
- **The icon as a badge in the tile's top-right corner**, which is the single
  most recognisable thing about the reference's stat row.

### What was rejected, and why it is written down

Argon's icon circles are **solid saturated fills**. Three of this app's four
ring meanings survive that; the fourth does not. Money owed is amber, and a
saturated amber is diesel — `amber-600` is hue 33°, diesel's own swatch is
27°, its accent rule 17°. Six degrees is not a distinction. Rendered, the "On
credit" ring sat one section above a diesel-accented card and was the loudest
thing on a page where orange is supposed to mean one fuel. No step is both
solid and not orange (`amber-700` is 25°, nearer still), so the whole set went
to `100` over `700` rather than making one tile the odd pale one out.

**The generalisable bit: check a chrome colour against `fuel-colors.js` by
hue, not by eye.** Six degrees apart looks like a different colour in a swatch
and the same colour on a page. An earlier draft of this change shipped a code
comment asserting the solid amber "sits on the chrome's side of that line" —
written before rendering it, and wrong.

### The bug the layout change exposed

Copying Argon's arrangement directly — label and figure in a column, icon
beside them — put `Rs 1,204,950` underneath the icon. Chasing that turned up
something older and worse.

**Money figures were overflowing their cards at nearly every laptop width, and
had been.** Swept in 20px steps from 340px to 1600px, `main` overflows the
figure at every width from 860px up, and the page itself scrolls sideways
between 860 and 900. It was invisible because `Rs 1,603,290` on the ordinary
dashboard happened to clear the icon by about 6px — the tiles that did not
clear are Expenses, Reports and any month with a seven-figure total.

Two fixes, both measured rather than guessed:

- **The icon moved onto the label's row**, so the figure spans the whole card
  instead of the card minus 48px. The label is short and elastic and can give
  up the width; the figure cannot.
- **`grid-cols-4` and `text-2xl` got separate thresholds** — `@[54rem]` and
  `@[62rem]`, against the grid. They were one number (`@[50rem]`) serving
  both, and four columns arrived while each tile was still ~204px. A single
  breakpoint cannot serve a column count and a font size that need different
  amounts of room.

The same 20px sweep now reports clean from 340px to 1600px.

### Blast radius

`StatTile` is on eight pages and `.card` on nearly every block in the app, so
this is a wider change than "the dashboard". Verified by rendering the
dashboard with realistic fixtures at laptop and phone width, plus a strip of
`StatTile` edge cases the dashboard does not itself produce: a negative tone
with its pill, a positive tone, a seven-figure value, a two-line `sub`, and
the no-icon variant.

## Stat tiles get the Ramtabs anatomy, and a sparkline

The owner sent a screenshot of the Ramtabs finance dashboard — the design he
had been trying to show since the start, and which none of the earlier
guessing had matched — with two asks: _"the cards on top with graphs too if
possible and the card text in the card should be shown like this"_, then
_"i want to improve the top cards in all my website pages which uses cards"_.

So this is app-wide, not the dashboard: `StatTile` is on eight pages.

**The anatomy is now the reference's.** A 16px icon sharing the label's line,
the figure below it, the comparison under that, and a sparkline at the
figure's right where a series exists. The filled icon ring from the Argon pass
is gone — the reference spends its colour on the chart, not on a badge, and it
is the better trade.

**The sparkline is hand-drawn SVG** (`app/_components/ui/Sparkline.js`), not
Recharts. Four Recharts instances in a stat row would each ship a client
bundle and measure themselves before painting, so the row the owner reads
first would land empty and pop in a beat later. A sparkline has no axes,
tooltip or interaction, so it is just a path: server-rendered, no JavaScript,
no layout shift, a few hundred bytes. It is `aria-hidden` and carries no
scale — it says "rising", "falling", "steady", and the figure is beside it at
24px.

**The dashboard's four sparklines are the same `trend` array the charts below
already draw**, read twice from one fetch. No extra query, and no way for the
little line and the big chart to disagree about a day.

### Diesel, again — and the rule that came out of it

The same trap as the Argon pass, sprung a second time in one sitting. The
tile's meaning colours include amber for money owed, so the "On credit"
sparkline came out amber, and rendered above the diesel-accented fuel cards it
was the same orange all over again.

The reasoning that let it through is worth recording, because it was written
down confidently and was wrong: a comment argued that a small glyph "spends so
little of the hue that the question goes away". True for a 16px outline
stroke. Not true for a 72×34px line with an area fill, which is **more** amber
than the 44px filled circle already rejected.

**The rule: the test is AREA, not size.** `SPARK_COLORS` is therefore a
separate map from `ACCENT_COLORS` and may only be green, red or slate — the
chrome colours no fuel owns. The money-owed group draws slate and keeps its
amber on the glyph. `tone` overrides both: direction beats category, or a
green line would sit under a red number saying the opposite thing.

### Verified

Rendered with the fuel-type cards deliberately in frame, because the colour
question only exists where chrome and fuel colours share a page — the first
pass was judged on a tile row alone and looked fine. Also swept in 20px steps
from 340px to 1600px: clean, including the 860–900 band where `main` used to
scroll the page sideways. At phone width the sparklines drop out entirely and
the tile is a label over a number, which is the intended degradation:
decoration must never be the reason a figure cannot be read.

### Two follow-ups from the owner, in the same pass

**"please use colorful icons too, relevant colors."** The accent map grew from
three meanings to five, and the two new ones are chosen around the fuel triad
rather than for it: **teal** for what the pump holds (fuel, stock, inventory,
lubricants, assets) and **violet** for the record-keeping (readings, banking,
dates). The obvious colours for "fuel" and "stock" are blue and orange, and
those belong to petrol and diesel — teal and violet are what is left that is
still distinct, and neither is a colour any fuel wears.

**"make sure graphs does not leak out of the card."** They were, and the sweep
that had reported CLEAN did not see it: it compared each figure's
`scrollWidth` against its own `clientWidth`, which says nothing about whether
the element sits inside its CARD. The sparkline carried `width={72}` as an SVG
attribute, so it stayed 72px wide however narrow the tile got and pushed
straight out through the right edge. It is now sized by class and shrinks with
its container.

Re-tested with the right check — every child's rect against its card's padding
box, at every width from 340px to 1600px — which promptly turned up a second
leak the first check had also missed: `Rs 14,386,211` escaping at 440px, where
two columns gave each tile 188px for a figure needing ~200px. Two columns now
wait until `@[32rem]`. **The lesson worth keeping: `scrollWidth` tests whether
an element overflows ITSELF, and that is not the question.**

**Not done: sparklines on the other seven pages.** Only the dashboard has a
daily series to hand. Customers, Expenses, Banking, Lubricants, Readings and
Reports would each need a small trend query before their tiles could carry
one; the anatomy change reaches them all today, the charts do not.

## Hover readouts, a redesigned Customers page, and the register goes live

Four asks from the owner in one round.

**Sparklines now show the value and date on hover.** `Sparkline.js` became a
client component to do it, having been written deliberately server-only with a
comment saying so. That comment was defending the right thing for the wrong
reason: what mattered was "do not put a charting library in a stat tile", not
"zero JavaScript". The markup is still server-rendered on first paint, so
there is no layout shift, and the hover state is all the client adds.

The readout is `fixed` and anchored to the pointer, not placed in the card.
The sparkline sits hard against the card's right padding and there is no room
inside for a panel beside it — and this component had just been through a
round of things escaping their cards. A fixed overlay is outside the layout
entirely: it cannot widen a card, push a figure, or scroll the page sideways.
It flips to the pointer's left near the viewport edge.

`tips` are formatted on the SERVER and passed as `{ v, d }` strings. A
formatter cannot cross the server/client boundary, and re-implementing PKR and
litre formatting inside the chart is how two parts of one app start
disagreeing about how a number is written.

### Customers, redesigned

- **"Over their limit" is gone**, as asked. What replaced it asks the same
  question without depending on a limit being set at all: how many owe
  anything right now, and the largest single balance. Most accounts have no
  credit limit on file, so a count of who was over one was a figure about
  whichever rows happened to have the field filled in.
- **Icons instead of initials on the avatars**, and they are not all the same
  one: a customer with a vehicle on file gets the vehicle, one without gets
  the person. That is a real distinction — fleet accounts and walk-up credit
  are different kinds of customer — rather than decoration picked from a hat,
  and it keeps the column from being forty identical circles. **What it costs
  is worth recording**: the initial was a faster cue than the name for telling
  two rows apart in a long list, and the deterministic tint is now carrying
  more of that work alone.
- **The vehicle moved out of its own column and under the name**, which is one
  fewer column to fit before the table scrolls sideways, and puts the field
  the owner scans for when two accounts share a name right beneath it.
- **The credit limit gained a usage bar.** How close an account is to its
  ceiling is a proportion, and a length is read faster than a number. Green
  under, red over, nothing in between — "approaching the limit" is not a state
  anyone acts on differently, and the word in the badge is what carries
  "over"; the colour is the second cue.

### The register is production now

- **The preview banner is gone** at the owner's word: _"this is a real page in
  production now"._
- **The default range ends TODAY, not on the 31st.** On the 3rd of August the
  page opened on "01 Aug – 31 Aug" with twenty-eight empty days below it, and
  a profit figure comparing three days of sales against whatever deliveries
  had landed, over a span the heading called a month. A past month still
  defaults to all of it, because there "so far" and "the whole month" are the
  same span. The day-of-month comes from `todayISO()`, so it is Asia/Karachi's
  day and not the server's.
- **The two fuel cards have graphs**, drawn from the per-day rows the card is
  already handed — no second query, and no way for the line and the total
  above it to disagree. They wear the **fuel's own colour**, which is the one
  place on the page allowed to: the card is that fuel's card and already
  carries its band. `onWhite` (the dark relative), because diesel's `#FDBA74`
  as a 2px line on white is 1.6:1 and all but invisible.
- **The four money tiles did NOT get graphs.** Only sales has a daily series;
  stock bought and expenses have no trend function behind them, and inventing
  one for a decoration is the wrong order to do that in. Three of four tiles
  bare and one charted looks like a bug rather than a choice, so all four stay
  as they are until the queries exist.

**Still open:** `MoneyTile` and `FuelCard` are MUI `Paper` while the rest of
the app is `.card`. That was justified while the page was a preview. It is not
a preview any more, so the two systems on one page should be reduced to one.

## Percent badges, graphs on the money tiles, and the Customers table ruled

**`DeltaBadge`** is the new shared piece: a coloured pill with the percentage
and an arrow, then the figure it is measured against in plain muted text
beside it. Split in two on purpose — the percentage is read at a glance, what
it is measured against is read only when the percentage is surprising, and
putting the whole sentence in the pill makes a chip that competes with the
figure above it.

**The arrow is direction; the colour is whether it is good news.** They are
different axes and this app has to keep them apart: expenses up is an up arrow
and a RED pill, sales up is an up arrow and a green one. Colouring by
direction alone would paint "expenses rose 40%" the same green as "sales rose
40%", which is the one mistake a money app cannot make. Callers pass
`higherIsBetter`. A change against zero has no percentage to state, so the
badge says the direction in words rather than inventing "+100%".

### Graphs on the register's money tiles

They were skipped last round for want of a daily series. Two new data
functions supply it — `getPurchaseTotalsByDay` and `getExpenseTotalsByDay` —
narrow date-bounded selects grouped in JavaScript, rather than a migration
written to feed a decoration.

**Neither takes a `limit`, deliberately.** `getExpenses` has one and defaults
it to 100, which is right for a table that pages and would be silently wrong
here: a cap on a list you are going to total is a cap on the total, and the
101st expense of a month would just vanish from the line.

**Days with nothing are zero, not absent.** Deliveries and expenses do not
happen daily, so their maps have holes; drawing straight from a map would give
a four-point line labelled as a month and quietly join the 3rd to the 19th as
if nothing sat between them. The day list comes from the sales trend, which
fills every day.

The percent badges compare against **the equally long span ending the day
before this one starts** — "this week against last week", never "these four
days against a whole month". One extra `get_range_summary` call, no new SQL.

### Customers

- **The table is ruled in both directions**, as asked. Vertical dividers are
  usually the wrong call — whitespace already does that work — but they earn
  their place once a row carries five short fields of similar visual weight,
  which is when the eye starts sliding between neighbouring cells.
- **The avatars are two-letter initials.** This has now been a single letter,
  an icon, and finally this, and the round trip is the point: the icon version
  lost something immediately visible, because forty identical circles tell you
  nothing about which row you are on. Initials are the strongest cue available
  because they differ per customer, which neither a colour nor an icon manages
  across a long list. First word and last word, so a trading name gives "BC"
  for Bilal Sons Goods Carrier rather than "BS".
- **Six tints, and none is a fuel's.** The reference uses lavender, pink,
  blue, peach and mint; blue and peach are the two this app cannot spend.
  Violet, fuchsia, teal, rose, green and slate give the same soft, varied look
  with nothing borrowed from petrol or diesel.
- **Search over name, vehicle and phone**, written to the query string like
  every other filter, debounced at 250ms and using `replace` so typing eight
  letters does not put eight entries in the browser's history. **The tiles
  still count every account**, not the matches — a search that quietly turned
  "total outstanding" into "total outstanding among rows matching 'ahm'" would
  be a figure that looks like the headline and is not.
- **Search and Add now sit in the table's own header bar**, at the owner's
  request, which is also the better place for them: both act on the table, and
  a control parked against the page title reads as applying to everything
  below it including the Removed list.
- **Phone is a column** — `migration 042`. The column has existed since 001 and
  the dialog has always written to it; nothing ever read it back, so a number
  typed into the form went in and was never seen again. Both read functions
  are dropped and recreated rather than altered, because Postgres will not
  change a function's return type in place, and the grants are restated
  underneath because dropping a function takes its grants with it. It renders
  as a `tel:` link: this list is read on a tablet at the pump, and the reason
  to look up a number is almost always to ring it.

### What is deliberately missing

**Cash and On credit have no percent badge on the dashboard.** Those tiles are
fuel cash plus lubricant cash, and `get_lubricant_trend` carries only amounts —
there is no per-day cash/credit split for oil. The comparison would have to
drop the oil half or pretend it was all cash, and a badge that is wrong by an
unstated amount is worse than none. Fuel sold and Total sales can be
reconstructed exactly from the two trends, so those two have badges. Fixing
the rest means widening the lubricant trend RPC — a migration, not a format
change.
## Company Assets get their colour back

_"add some colors in these icons, they look boring right now"_ — the owner,
looking at fourteen assets rendered as fourteen identical grey blocks.

This reverses part of an earlier decision, and the earlier reasoning is worth
keeping rather than quietly overwriting. The audit recorded above under **"What
the decorative hues were actually doing: nothing"** stripped five hues from the
asset categories on the grounds that a car, a wrench, a building, a monitor and
a tag already tell the five apart, so the colour was a weaker second copy of
what the icon said. That argument was correct and still is. What it missed is
that **it answers a question about safety, not a question about whether a page
is worth looking at.** Company Assets is a private register the owner opens for
his own reference — nothing on it gets checked against cash in a drawer — and
it was the one screen in the app that could afford to be pleasant. It was
instead the greyest thing in it.

**What the old hues actually broke, and what the new ones do differently.** The
set that was removed spent **sky and violet** — petrol's blue, and the colour
lubricant wears. That is the rule in `docs/UI_CONVENTIONS.md` → "Two palettes,
and they never overlap", and it is load-bearing: the owner's father reads the
fuel colours to know which nozzle he is entering. The restored set touches
none of them:

| | | |
|---|---|---|
| Vehicle | teal | |
| Machinery | violet | |
| Property | brand green | the app's own |
| Electronics | fuchsia | |
| Other | slate | uncoloured on purpose — "uncategorised" is the one value where the absence of a hue is accurate |

**Red and amber are barred too**, and for a sharper reason than tidiness: every
card on this page carries a money figure, and an amber tile beside `Rs 132,000`
reads as a warning about the number rather than as a category. That leaves
exactly four usable hues and a neutral — a real ceiling, and a sixth category
should fall to slate rather than reach for a reserved colour.

**Nothing here is knowable by colour alone**, which is what makes the hue
decoration rather than a cue: every card still carries its own icon *and* its
written category label. The rule the audit produced — colour a thing only when
the colour adds meaning its shape does not — governs where colour is
*required*, not where it is *forbidden*, and reading it as a ban is what
produced the grey page.

**Two of the four stat rings are now coloured, and two deliberately are not.**
"Total value" takes brand green (a briefcase says "assets"; the green says "and
this is money the business holds", which is what green means in every other
ring in the app), and "Biggest holding" wears its *category's* hue via the
`ringTone` escape hatch, so the tile and the cards below it agree about what
Electronics looks like. "Assets recorded" is a count and "Newest addition" is a
date — nothing for a colour to add, so they keep the neutral fallback rather
than being tinted to even the row up.

### What rendering it caught

- **The `50` step was too pale for the icon tile.** Built first at `bg-*-50`
  throughout, the teal and brand-green tiles washed to near-white against a
  white card — the page still read as grey, so the change had cost the earlier
  argument without buying the look. The tile is now the `100` and the chip
  stays the `50`, which is the pairing the neutral `other` already used
  (`bg-ink-200` tile, `bg-ink-100` chip). Only visible in a screenshot; the DOM
  was "correct" at both.
- Checked at 1152px, 1440px and 400px. No new wrapping, no horizontal scroll,
  money figures still on one line at phone width.

## Bigger tile icons, and initials that survive the real customer list

**The stat-tile icon went from 16px to 20px** — _"they are too small"_. It was
undersized against its own 12px uppercase label to begin with and read as a
bullet point rather than a picture of the thing. It is the shared tile, so the
size lands on every page with a stat row.

**The asset-category colours were cherry-picked onto this branch.** They were
built on `claude/icon-colors-ws7dln` and the owner was looking at a build
without them; the two branches now agree.

### The initials were wrong, and only the real data showed it

`customerInitials` took the first word and the LAST word, reasoning that a
trading name's last word is what distinguishes it — "Bilal Sons Goods Carrier"
vs "Bilal Sons Filling Station". Sound reasoning, never checked against this
pump's actual customer list, where names carry a **ledger number** on the end:

| Name | Was | Now |
|---|---|---|
| Abdul Ghaffar 13 Solang 561 | A5 | AG |
| Akram Saudi Arab 447 | A4 | AS |
| Al Jadeed poultry Farm Khizer 748 | A7 | AJ |
| Al-Mustafa Dera Bakha 605 | A6 | AD |

A column of A5 / A4 / A7 / A6 is worse than no bubble at all — it reads as a
code the reader is meant to recognise. It is now the **first two words**, and
words beginning with a digit are skipped, so "Akram 447 Saudi" gives AS rather
than A4.

**The lesson is not about initials.** The fixture names used to build this
were "John Doe" and "Bilal Sons Goods Carrier", and both worked perfectly. The
real list is names plus filing numbers, and no amount of care over the
algorithm would have found that — only running it over the actual names did.
When a helper derives something FROM USER DATA, test it on the user's data.

## The percent badge loses its sentence

`DeltaBadge` shipped as two parts — the pill, then "up from Rs 655,595
yesterday" beside it — on the reasoning that the percentage is read at a
glance and the baseline only when the percentage is surprising. The owner had
the sentence removed, and the tiles are better for it.

The argument for keeping it was about the badge in isolation. On the actual
tile it is the **fourth** thing on a card that already carries a label, a
figure and a sparkline, and it was the only line there made of prose. It also
pushed every tile taller to say something one date-step away already answers.

**`previous` is still required** — the badge cannot be computed without it. It
is simply no longer printed.

What this costs is one of the two written cues, so the remaining ones have to
carry it: the **arrow** states the direction independently of the colour, so a
reader who cannot separate the red pill from the green one still sees which
way the figure moved. That is why the arrow is drawn rather than implied by
hue, and it is now the only thing standing between this badge and colour being
the sole cue.

## "Why new?" — and the badge that had nothing to say

The register's four money tiles all showed a **"New"** badge at once. The
answer is in the data, not the code: this pump's records begin **01 Aug 2026**
(`min(reading_date)` confirms it), so the equal-length span before any August
range lands in July, which is empty. `previous` came back 0, there was nothing
to divide by, and the divide-by-zero branch printed "New" on every card.

**A zero baseline and an absent one cannot be told apart here.** Both arrive as
0 from the summary RPC, and "sales rose from nothing" and "there is no July to
compare against" are different sentences. Given a label that is sometimes
wrong or no label, **a card with no comparison now shows no comparison.** The
figure above it is unaffected and still true. The reasoning is kept in the
file because "just show 100%" is the obvious next suggestion and it is wrong —
a percentage of zero is not a percentage.

### Cash and On credit get their badges — migration 043

`get_lubricant_trend` returned amounts and litres but no cash/credit split, so
those two tiles (fuel cash **plus oil cash**) had no exact previous day and
shipped without badges. `lubricant_sales` has carried `cash_amount` and
`credit_amount` since 024, with a constraint that they sum to the amount —
nothing new is recorded, two existing columns are now summed and returned.
All four dashboard badges are exact; none is an estimate.

**042 and 043 are applied to the live database**, at the owner's instruction,
and verified by reading the function signatures back from `pg_proc` rather
than trusting the success flag.

### Two pills stacked is clutter

`StatTile` rendered every `sub` as a pill, which is not what its own
documentation said — the pill was meant for a `sub` with a *direction*. It did
not matter until the percent badge arrived and put two chips of nearly equal
size one above the other.

They are different kinds of thing: the badge is a **measurement** and earns a
chip; `sub` is a **description** ("Rs 795,698 fuel · Rs 2,400 lubricants") and
reads better as a line of text beneath one. A toned `sub` keeps its pill,
where the colour and arrow carry meaning grey text would lose. `DeltaBadge`
also stopped setting its own top margin — the tile owns the spacing between
its parts, and a component adding `mt-1` on top of the tile's gap sits at a
different distance depending on what is above it.

### No empty cards

On a day with no readings the four tiles were "Rs 0" over an inch of white,
which reads as a page that failed to load rather than a day nobody has entered
yet. Each tile now says which: "No readings entered for this day", "Nothing
sold on this day", "Nothing taken in cash", "Nothing sold on credit". There is
also a middle case worth naming — fuel sold but no oil — which now says "fuel
only — no oil sold" instead of falling back to the blank.

## Daily readings, redesigned — nozzles as cards, and the tank's own colour

_"it is the worst looking page on my website"_, with three specifics: keep the
fuel colours the Stock page uses, stop the nozzles being "a horizontal
container shiz", and make it obvious at a glance where each fuel's nozzles
are.

**Read the history first, as CLAUDE.md requires**, because this page has had
three designs reverted. Nothing reverted came back: entry is still a dialog
per nozzle (inline editing was built and reverted — _"model window was
better"_ — and the reason still holds: the dialog's value is one nozzle on
screen and nothing else to type into by mistake), the unit is still the card,
the day banner and the cash-up bar are untouched.

### The nozzles are cards, two across, not two full-width bands

A dispenser has two nozzles side by side; the page had them as two identical
strips running the whole width of the screen. A card each is closer to the
physical thing and much less page to scroll — three units now occupy roughly
what two did. `@container` rather than `sm:`, since this grid sits inside a
card inside a 240px sidebar layout, and `items-stretch` so an un-entered
nozzle stands the same height as its entered sibling.

The figures went from four columns across a full-width row to **two by two**,
which also puts the pair that has to agree — total sale, and cash plus credit
beneath it — directly above one another. The chevron went: on a full-width row
it was the only thing saying "this opens", but a card is obviously its own
target and the chip already carries the word.

### The unit band is now the Stock page's tank colour

`solid`, at the owner's request, so a pump and the tank it draws from are
unmistakably the same colour across the two screens. That gives up the
lightness channel the header used to carry (`soft` while unfinished, `strong`
when done). Acceptable: "finished" is still said by the check icon, the "2 of
2 entered" chip, and the absence of the progress bar — which the earlier note
on that bar had already observed was saying it three times over.

`solid` is dark-with-white-text for petrol and light-with-dark-text for diesel,
so everything sitting on the band needs to work on both. One pair of classes
does it: a `bg-white/25` wash with a hairline `ring-black/10`, and
`currentColor` for text and icons so they follow whichever the band brought.

### Which fuel, said loudest

Each nozzle card carries a **fuel-coloured pump glyph** — drawn, not a
photograph. It takes its hue from `fuel-colors.js`, so it cannot drift out of
step with the badge beside it or the band above it the way an image file
would; it stays sharp on the tablet; it adds nothing to download. `soft` is
the pale-tint-with-dark-text pair, which is legible for both fuels where
`solid` would put dark on dark for petrol.

It is the third statement of the fuel, never the only one: the badge says the
word, the card carries the fuel down its left edge, and the unit band names it
above.

### What rendering it caught

At 400px the icon, badge and chip took the row between them and the nozzle
name clipped to **"Noz…"** — the one word identifying which nozzle you are
about to type into, on the screen built entirely around not typing into the
wrong one. Letting it wrap instead stacked "Nozzle" over "A", which is not
hidden but is not a name read at a glance either. `whitespace-nowrap` on the
name plus `flex-wrap` on the row sets the priority properly: the name cannot
break, so the **chip** drops to a second line when the four things do not fit.

### Entered is now the fuel's own colour

Reported straight after the redesign: _"no clear differentiation whether
reading entered or not"_. It was fair — an entered card was `brand-50/40`,
which is four parts white to one part green, and beside a plain white card at
a glance they were the same card.

An entered nozzle now wears **its own fuel's tint**, at the owner's request.
One cue says both things: a finished diesel nozzle is unmistakably diesel and
unmistakably done, and an un-entered one stays white and stands out against
its filled neighbours. It also stops spending a second colour on a card that
already had one.

**This inverts which state is loud**, and that is the point rather than a side
effect — the ask was to *see* that a day has been entered. On a part-finished
day the white cards still read as the odd ones out, so nothing is lost for
someone working down the page; the Enter chip and the fuel edge still carry
the word and the border.

Two things had to move with it, both because the card is no longer white:

- **A new `tint` token in `fuel-colors.js`** — background only. `soft` could
  not do this job: it carries a text colour, so the whole subtree inherits the
  fuel's dark relative, which is right for a header band and wrong for a card
  full of money figures that must stay near-black.
- **The pump glyph sits on a white tile with a fuel-coloured icon**, not on
  the fuel's tint. Tinted-on-tinted is nothing — orange-100 on orange-100
  disappears. The divider inside the card became `border-black/10` for the
  same reason: a fixed slate hairline goes muddy over orange.

## The unit header band gets a texture

_"patterned, grainy with 3D look"_ — and, when a plain two-stop gradient was
tried first, _"no no nooo"_. The colours were never the problem: diesel stays
orange and petrol stays blue, flat `solid`, exactly as before. What was
missing was surface.

`.fuel-band` in `globals.css` layers four things over whatever
background-colour the element already carries:

1. **Grain** — fractal noise from an inline SVG filter, as a data URI so there
   is no second request. `overlay` blending is what makes it darken the dark
   parts and lighten the light ones rather than dusting the whole strip grey.
2. **Weave** — 45° hairlines at 4% white. Barely visible alone, which is the
   intent: it gives the surface a direction, so the band reads as a material
   rather than a fill.
3. **Sheen** — a wide radial highlight in the top-left, doing most of the "3D"
   work. Light comes from one place, so the strip reads as a curved surface
   lit from above rather than a rectangle with a gradient on it.
4. **Lift** — inset hairlines, white along the top edge and black along the
   bottom: the same trick a physical bevel plays.

**IT ADDS NO COLOUR.** Every layer is white or black at a low alpha, so the
band is "the fuel's colour, textured" and never a new hue — the only terms on
which a decorative treatment may go near the fuels. `fuel-colors.js` still
owns every hue in the app, and this class does not know which fuel it sits on,
which is exactly why it can sit on all of them: it works unchanged on diesel's
light orange and petrol's dark blue, the pair that breaks any treatment built
from a fixed colour.

Every alpha is under 12%. The band carries the unit name and its "2 of 2
entered" chip and is read on a cheap tablet in poor light, so the texture has
to survive being looked past, not looked at.

Rendered over diesel, petrol, lubricant and the mixed-unit neutral before
committing.

### Rejected first: a flat gradient

A `band` token was added first — the same colour as `solid` with a
left-to-right gradient — and turned down. Recorded because the reasoning still
holds for the constraint, if not for the result:

**Both stops are colours the fuel already owns**, taken from the tokens listed
above them in the same file — petrol `#075985 → #0369A1`, diesel
`#FDBA74 → #FB923C`. That is the constraint that keeps this safe: the band
cannot drift away from the badge beside it or the tank card on the Stock page
wearing the flat version, because there is no new colour in it.

**One step of lightness and no change of hue.** The band's job is still to be
read as "diesel" at a glance from across the office; a gradient wide enough to
be admired is one wide enough to make its far end a different colour from the
badge next to it. The darker stop is the one to check if either is ever
changed — it is where the text contrast is tightest.

Rendered across all four cases before committing: diesel, petrol, lubricant,
and the neutral fallback a mixed-fuel unit gets.

## The texture hurt: high-frequency out, low-frequency in — and the whole unit lifted

_"it hurts my eyes, some nice texture for 40 + clients"_, then _"where is the
whole unit 3D look man"_. Two corrections to the pass above, and the first is
the one worth keeping.

**Grain and 1px hairlines were the wrong kind of texture for this reader.**
They were genuinely "grainy" and "patterned" — and both are HIGH-FREQUENCY
detail, at the scale of one or two pixels. On a cheap tablet that shimmers as
the panel scrolls, can moiré against the screen's own pixel grid, and gives a
40-plus eye something to keep trying to focus on that is not there. This app's
entire type and contrast floor exists for that reader; putting sandpaper
behind his headings undoes it.

**Nothing in the band is now smaller than the band.** Every layer is a wide,
soft wash measured in hundreds of pixels — a broad sheen from the top-left, a
matching falloff at the bottom-right, and one ~300px diagonal sweep at 5%
white. It still reads as a lit, slightly curved surface, which was the actual
ask, but at a scale the eye takes in without working. The only fine detail
left is the 1px bevel, and an edge is read once rather than scanned.

**The whole unit card is the 3D object now, not just its band.** A lit strip
on a flat sheet did not read as one thing. `.unit-card` stacks **four**
shadows, which is the entire trick: a contact shadow at 1px where the object
meets the page, a mid shadow at 8–16px for the body of the lift, an ambient
one at 44px for the room's light, and a white hairline inset along the top
edge as the highlight on its upper lip. The eye reads the combination as
height and any one of them as a blur.

`.card` keeps its own quiet shadow everywhere else in the app. Only the unit
is lifted this far, because it is a physical pump on the forecourt and the one
thing on the page worth making solid — if everything were raised, nothing
would read as raised.

The shadows are tinted with the app's own slate rather than pure black, which
over an `ink-100` page goes grey and dead.

**The colours did not change** and have not changed through any of this:
diesel's orange and petrol's blue, flat `solid`, straight from
`fuel-colors.js`. Every layer added here is white or black at a low alpha.

---

# Porting this round to the offline (Electron) build

The desktop build tracks this repo. This section is the catch-up list for it —
everything from the redesign round, sorted by what a port actually has to do
with it, rather than by the order it happened in.

## 1. Database — two migrations, both function-only

**Neither changes a table.** Both widen the return of an existing read
function, so an older client talking to a newer database just receives a field
it ignores. If the desktop build ships its own Postgres, run these against it;
if it reimplements the queries in SQLite or similar, mirror the two extra
columns.

| Migration | Change |
|---|---|
| `042_customer_phone_on_the_list.sql` | `get_customer_balances`, `get_retired_customers` → add `phone` |
| `043_lubricant_trend_cash_and_credit.sql` | `get_lubricant_trend` → add `cash_amount`, `credit_amount` |

**Both DROP and recreate rather than `ALTER`.** Postgres will not change a
function's return type in place — `create or replace` fails with "cannot
change return type of existing function" — and **dropping a function takes its
grants with it**, so the `revoke`/`grant` pair is restated underneath each
one. Leaving those out ships a function every signed-in user is refused by.

Both are applied to the live Supabase project. Neither backfills anything;
`customers.phone` has existed since `001` and `lubricant_sales.cash_amount` /
`credit_amount` since `024` — the data was always there and simply never came
back out.

## 2. New shared files

| File | Purpose |
|---|---|
| `_components/ui/Sparkline.js` | `'use client'`. SVG trend line + hover readout |
| `_components/ui/DeltaBadge.js` | Percent pill; server component |
| `_components/admin/CustomerSearch.js` | `'use client'`. Debounced query-string search |

## 3. Changed shared files — these reach every page

- **`_styles/globals.css`** — `.card` shadow and radius; new `.fuel-band` and
  `.unit-card`.
- **`_components/admin/AdminStats.js`** — `StatTile` rebuilt (icon beside
  label, figure, optional `spark`/`sparkTips`/`delta`, then `sub`);
  `RING_COLORS` → `ACCENT_COLORS` + `SPARK_COLORS`; `ringTone` → `accentTone`;
  grid and type thresholds moved to `@[32rem]` / `@[54rem]` / `@[62rem]`.
- **`_lib/fuel-colors.js`** — new `tint` token (background only).
- **`_lib/customer-avatar.js`** — `customerInitials()` (first two words) and
  `customerAvatar()`; `customerInitial()` kept for anything still on one
  letter.
- **`_lib/data-service.js`** — `getPurchaseTotalsByDay`,
  `getExpenseTotalsByDay`.

**`StatTile` is on eight pages and `.card` on nearly every block**, so those
two are the whole-app blast radius. If the desktop build has diverged in
either, reconcile them before the page-level changes.

## 4. Page changes

| Page | Change |
|---|---|
| Dashboard | Sparklines + day-over-day badges on all four tiles; empty-day messages |
| Customers | Ruled table, initials avatars, phone column, search, Add moved into the table header, over-limit tile removed |
| Reports → Register | Preview banner removed; default range ends **today**; fuel cards get sparklines; money tiles get sparklines + prior-period badges |
| Readings | Nozzle cards two-across; unit band = Stock page tank colour + `.fuel-band`; entered nozzle wears its fuel's `tint`; `.unit-card` depth |
| Company Assets | Category icons coloured (teal / violet / brand / fuchsia / slate) |

## 5. The rules worth carrying over, not just the diffs

If the desktop build only takes one thing from this round, take these — each
was learned by getting it wrong first, and each is written up in full in
`docs/UI_CONVENTIONS.md`:

- **Check a chrome colour against `fuel-colors.js` by HUE before saturating
  it.** `amber-600` is 33°, diesel's swatch is 27°. Six degrees is not a
  distinction. Caught twice in one sitting — once as a filled ring, once as a
  sparkline — because the second felt too small to matter.
- **The test is AREA, not size.** A 16px amber glyph is fine; a 72×34px amber
  sparkline is more of the hue than the filled circle already rejected.
- **Test containment against the card's PADDING box.** `scrollWidth` asks
  whether an element overflows *itself*, which is not the question.
- **Decoration yields; the figure never does.** Money is `whitespace-nowrap`
  and cannot shrink, so the sparkline hides instead.
- **Nothing textured smaller than the thing it sits on.** High-frequency grain
  shimmers on a tablet and tires a 40-plus eye.
- **Depth is stacked shadows, not one big one.**
- **When a helper derives something from user data, test it on the user's
  data.** The initials helper passed every fixture and produced "A5" for a real
  customer.

## Credit slips: type the amount, the litres follow

_"right now entering amount calculates the amount, do the opposite, client
should enter the amount and litres calculated itself, and move the amount
input box in place of litre and vice versa"._

The slip row ran litres-in, amount-out. It now runs the other way, and the
input order was swapped to match: **Amount first, Litres second.**

**This matches how the slip is actually written at the pump.** A customer asks
for "two thousand rupees of diesel", the attendant serves it and writes the
rupees down. The litres are the consequence, not the input — the old direction
asked the person filling the form to do the division in their head first.

**Both fields stay editable.** The derived side is filled in and can then be
overwritten, because a slip is occasionally rounded off by hand, and the paper
in the drawer is what the books have to agree with — not what the rate says it
should have been. That was true of the amount before and is true of the litres
now.

**The rate is guarded rather than divided by blindly.** `rate` is null until
the day's price is set, and a bare `amount / rate` would put `Infinity` into a
field that goes to the database. No rate means the litres are left for the
reader to type. Checked across a rate of null, `0` and `undefined`, an empty
amount, a zero amount and a non-numeric one — every one of them leaves the
litres empty rather than producing a value.

The placeholders moved with the boxes. Swapping two identical-looking number
inputs without swapping their labels is exactly how a rupee figure ends up in
the litres column.

## Modals: the background blurs, and the way out looks like a button

**The backdrop went from `ink-900/50` to `ink-900/60` plus `backdrop-blur-sm`.**
A flat wash darkens the page behind but leaves every edge on it sharp, so the
eye keeps finding the cards underneath; blurring destroys the detail the eye
was catching on, and the dialog reads as the only thing in focus. Applied
**wherever a modal appears** — the shared `Dialog` (which `ConfirmAction` and
every entry dialog already route through) and `AdminSidebar`'s mobile nav
drawer, which owns its own `<dialog>` and would otherwise have been the one
that still looked flat.

**The close button is a real control now.** It was a bare `✕` glyph in
`ink-500` with no edge until hover, which on a white header reads as
decoration — and this dialog is the only way out of the entry task, so the way
out has to look like one. It is a bordered circle with a drawn stroke rather
than a text glyph, so it renders identically whatever font is loaded.

**And it is a TARGET.** 44×44, measured rather than eyeballed, which clears the
tap-target floor the app holds everywhere else; the old one was about 28px. On
a tablet held one-handed at the pump that is a miss waiting to happen — and a
miss here lands on the backdrop, which deliberately does nothing (dialogs
holding a form do not close on click-outside; see "No click-outside-to-close"),
so the reader taps twice and wonders why.

`hover:text-red-700` rather than a red default: leaving is not destructive, so
the button should not sit there coloured like it is. The red is a response to
being aimed at.

## The oil chart wears lubricant's colour

Packed was brand green and loose was violet — two hues borrowed from the
chrome to separate two halves of **one product**. On a chart headed "Oil
sales" that is backwards: the reader's first question is which bars are oil,
and neither colour answered it. Gold does, and it is what lubricant already
wears on its badge and its stat-tile glyph.

**The pair is separated by LIGHTNESS, not hue** — and as far apart as the
family allows: `#655216`, lubricant's darkest gold (the one its text on white
uses), against `#D4AF37`, its vivid one. Both come from `fuel-colors.js` and
are imported rather than retyped, so the chart cannot drift out of step with
the badge.

The first pass used the middle `#977B20` for packed and the two blocks sat too
close to separate in a stacked bar. `deepHex` was added to lubricant for this:
charts take colours, not classes, and `onWhite` only existed as a Tailwind
class — a chart that retypes the hex is a chart that drifts.

Two reasons that is the right axis here. A second hue would be another colour
decision inside a product that owns one. And a lightness step survives
red-green colour blindness, where two hues of similar value do not — stacked
in the same bar, a light block over a dark one reads as two parts of a whole,
which is exactly what packed and loose are. The legend still names both, so
the colour is never carrying it alone.

Violet remains spent in one place only: `CashCreditChart`, where it separates
credit from cash and was chosen with a palette validator (green/violet
separates for red-green colour blindness where green/amber does not).

## The sparklines stopped disappearing on a real window

_"the graphs disappear when screen size reduced"._ They did, and on the size
the app is actually used at: the tile grid hid its sparkline below `@[68rem]`,
and on a 1360px window the 240px sidebar leaves the grid around 1090px — just
under the line. The charts were missing on the owner's own screen.

**The rule was right and the mechanism was wrong.** "Decoration must never be
the reason a figure cannot be read" still holds — the money figure is
`whitespace-nowrap`, cannot shrink, and must own its line. But the alternative
to competing for that line was never *vanishing*; it was **moving**.

The figure's row now wraps. Where the two fit side by side they still do; where
they do not, the chart takes its own line underneath at **full card width** —
which is a better chart than the squeezed one, roughly four times wider than
the 72px it gets when it shares. The figure is untouched either way.

Applied to `StatTile` and to the register's `MoneyTile`, which had the same
`hidden … @[62rem]:block` treatment.

Verified by counting rendered sparklines at 1120px, 900px, 560px and 400px —
twelve at every width, where the narrow ones previously rendered none — and by
looking at each, because a count of twelve would also be satisfied by twelve
charts squashed into unreadable slivers.

## Treasury: the cash in the safe on site

The owner keeps cash on the pump site, in notes, in a safe — the day's takings
before they are banked, money lent to people and taken back, cash handed to a
supplier against a purchase code, and a float for whatever needs paying that
hour. **None of it is in the banking system**, so nothing in this app knew
about it. The record was an Excel sheet called "Tajori" with five columns —
Date, Cash In, Cash out, Balance, Details — and a balance nobody could check
without opening the file.

`/admin/treasury` is that sheet, owner-only, with the real 36 entries from
14–21 Aug 2026 seeded in (migrations 044, 045). The closing balance on screen
is **Rs 8,364**, which is the figure at the bottom of his own Balance column;
every intermediate balance was checked against the spreadsheet row by row
before this shipped, and the seed migration asserts the total and rolls itself
back if it does not match.

### Standalone, on purpose

Nothing else in the app writes here and nothing reads from it. "Cash of shift
closing" is typed by hand even though Readings knows the day's cash figure, and
cash deposited into a bank is typed into Banking separately. That was the
owner's call and it is the right one for a first cut: **the safe is reconciled
against notes in a drawer, not against another screen**, so an entry that
appeared in it by itself would be an entry nobody counted. The obvious next
step — offering a one-click "Cash of shift closing" when a day's readings are
saved — is deliberately not built yet.

### What the database enforces

- **The safe may never hold less than nothing**, judged over the *whole chain*
  rather than one balance. An entry inserted or deleted in the middle moves
  every balance after it, so a row that is fine where it lands can still push a
  later day below zero — and deleting an early cash-in is refused for the same
  reason. It is a **deferred constraint trigger**, so a multi-row change is
  judged on where it leaves the sheet, not on each row as it lands. The message
  names the line it breaks on: _"On 17 Aug 2026, after "PSO Zamzam PS 118014"
  (Rs 1,593,990 out), the safe would be at minus Rs 812,080."_
- **One opening entry, ever** — "Already in the safe" is a single moment, and a
  second one always means a miscategorised cash-in.
- **A category belongs to one direction.** "Deposited in a bank" is not a way
  cash arrives; "Cash of shift closing" is not a way it leaves.

Both of the last two surface as raw Postgres constraint names, so `describe()`
in `actions.js` maps them; the balance rule raises its own sentence and needs
no entry there.

### Order without times

Two entries on one day have no clock reading behind them — the owner writes a
line when the cash moves. So `seq` (an identity column) is the sheet's row
order, and the chain is ordered `(entry_date, seq)` everywhere: in the view, in
the balance rule, and on screen. A back-dated entry lands at the end of its own
date, which is the only honest place for it. `created_at` could not do this
job: a line typed in later for the same day would sort by when it was *typed*.

The running balance is a window function in the `treasury_ledger` view, not
JavaScript — the page shows 25 rows at a time and a balance worked out from the
rows on screen would be the balance of a page rather than of the safe.

### Two things the DOM check did not catch, and a screenshot did

Both are the failure CLAUDE.md warns about: `hasScroll: false` and "no clipped
text" while the screen is wrong.

**The form beside the table hid the balance column.** Built first as a standing
form in the 22rem column — right for a page opened five or six times a day to
write a line — the six-column table got 504px of the 736px it needs, and the
**Balance column was off the right-hand edge**, inside the table's own
scroller. That is the one column the page exists to show. The form moved behind
a dialog and the table took the full width, which is what "Layout: form beside
a table" already said to do, and what Readings arrived at independently.

**Then the pinned balance lost its last digit.** Pinning the balance right
(the register's pattern) needs `right: <width of everything right of it>`, and
the delete button's column is 3rem of button *plus* `.td` padding — 68px, not
the 3rem it was offset by. Every figure was painted 8px under the action
column: `Rs 1,781,910` lost its last digit on a phone, and the text was not
overflowing its own box so nothing measured it. **The balance and the delete
button now share one pinned cell at `right: 0`**, which has no offset to get
wrong — and which also keeps the button reachable, since a balance pinned
alone at `right: 0` would sit over it at every scroll position.

Only the right-hand end is pinned; the date scrolls. The register pins both
ends, but its middle is eight columns and this one's is four — two pinned ends
would leave ~140px of scrollport at 400px, which is the "the pinned columns are
very nearly the whole table" failure the register recorded, reached from the
other direction.

### A hand-drawn icon, the first since the set moved to Material UI

Material UI has no safe. Every money glyph it offers says the opposite of what
this page means or says nothing: `Savings` is a piggy bank (the owner's verdict
was immediate), `Lock` reads as security settings in a list of nav items,
`Payments` is a stack of notes sitting one row under `AccountBalance` saying
much the same thing. So `treasury` is drawn in `Icon.js` — a box on feet with a
combination dial and a handle — and registered there like any other name, so
call sites are unchanged.

**Four marks, not six, and that was measured.** The first draft drew the door
as a second rectangle inside the body with a small dial on it; at 16px the two
nested rectangles closed up and read as a little screen or a banknote — exactly
the confusion the icon exists to avoid. Dropping the inner rectangle and making
the dial big enough to be seen as a dial is what makes it legible small. Four
variants were rendered side by side at 16/20/24/48px before choosing.

### Smaller notes

- The stat tile's ring for `treasury` is **teal**, the "things the pump holds"
  group — cash in a safe is a level in a container, like fuel in a tank, not
  money arriving. The two movement tiles beside it use `moneyIn` / `moneyOut`
  and keep green and amber.
- The chart is one `ComposedChart`: bars for the day's movements in the app's
  validated green/violet pair, and the closing balance as a **slate line**,
  deliberately not a third hue — it is the level the two movements add up to,
  not a third kind of movement. One Y axis, because both are rupees.
- `CategoryBreakdown` gained an optional `title`; Treasury renders two of them,
  "Where it came from" and "Where it went", and one heading could not serve
  both. Expenses is untouched.
- The category picker is a `<select>`, which is the convention rather than an
  exception to it — tiles are for options with an obvious symbol, and "Cash of
  shift closing", "Entry" and "Money returned" have none.
- The daily series **carries the balance forward** across days with nothing
  recorded. A safe with nothing happening to it still holds what it held
  yesterday; a line dropping to zero on a quiet Sunday would be a lie told by a
  gap.

## A dialog was inheriting the table cell that opened it

Reported from the Treasury page: the delete confirmation came up with its
explaining sentence right-aligned, unwrapped, running off the panel and
scrolling sideways inside the dialog — so the line saying *what deleting
actually does* was half off screen.

`<dialog>` + `showModal()` paints in the top layer, so its position and size
owe nothing to where it sits in the DOM. **Inherited properties are a different
matter**, and every `ConfirmAction` renders its dialog inside the table cell its
trash icon lives in. Treasury's sits in a `.td-num` cell, which is `text-right`
and `whitespace-nowrap` so the balance beside it cannot break — and the
confirmation took both.

`Dialog`'s panel now carries `whitespace-normal text-left` as a reset. Fixed
there rather than at the call site because the panel is what is wrong: a
modal's typography must not depend on which cell opened it. **Banking's delete
dialog had been inheriting `text-right` from its own cell all along** and this
fixes that too.

Verified at 1152px and 400px: `text-align: left`, `white-space: normal`, no
horizontal scroll on the panel or the dialog, nothing clipped.

## The treasury chart stops where the entries stop

044 ran the day-by-day window to `greatest(pump_today(), max(entry_date))` and
carried the balance forward across days with nothing recorded, on the reasoning
that a safe nobody touched still holds what it held yesterday. That is right
for a **gap** — a quiet Tuesday between two busy days is a real day the safe sat
there — and wrong for the **end of the sheet**, where it was also being applied.

The difference is what the last point means. In the middle, a carried-forward
day is a day that happened and had no movement. At the end it is a day nothing
has been entered for *yet*, and drawing it says "the safe closed today at
Rs 8,364" when the truth is "nobody has written today down". With entries to
21 Aug and a pump day of 22 Aug the chart ran a flat line out to 22/08.

The owner's spreadsheet does carry its last balance past the last entry — a
spreadsheet needs somewhere to put the formula. The app computes the balance
from the rows, so it has nothing to gain by inventing a day.

Migration 046 ends the window at the last entry. The carry-forward *inside* the
window is untouched, because that part was right.

**The two movement tiles read from the same window**, so "the last 14 days" now
means the fourteen days up to the last entry. Rather than leave a window that
has quietly stopped moving described as though it had not, they name the day it
ends on: **"14 days to 21 Aug 2026"**. On a day the sheet is up to date that
reads as today's date, which is what it is. It costs four words and cannot go
stale — the general form of a lesson this file already has more than one entry
about.

## A treasury page is a day, not 25 rows

25 rows is the app's default page size and it was the wrong unit here. A pump
writes three to six treasury lines a day, so a 25-row page held four and a bit
days, **cut mid-day at both ends**, and was tall enough to hit the
`.table-scroll` 70vh cap — a scrollbar inside a card, inside a page that also
scrolls. Nothing about "25" means anything to the person reading it.

A day means something: it is the unit the owner counts in, closing the safe on
an evening and checking that evening's figure against the notes in it.
Migration 047 adds `treasury_day()`, and the page now shows one day at a time.
Three things fell out of that:

- **The date column left the table.** Every row on a page shares the date, so
  it belongs in the heading — which bought back about 110px of width and is why
  the reason column can afford to scroll on a phone.
- **The day's own opening and closing are on screen**, with its cash in and
  cash out. The 25-row view could not show these at all: its rows started and
  stopped mid-day, so there was no such figure to print. This is the number
  actually checked against the drawer.
- **Both scrollbars are gone** at laptop width, on the busiest day the sheet
  has (17 Aug, seven entries) as well as a typical three-entry one.

**Addressed by date, not by page number.** `?date=2026-08-21` rather than
`?page=3`, for two reasons. A page index is not stable — back-fill one older
entry and every page number after it means a different day, so a bookmarked or
reloaded page 3 quietly becomes page 4's contents. And a date is what the app's
existing `<DateJump>` box already navigates by, so jumping to a day cost
nothing new.

**Days with nothing recorded are skipped**, which is the point of paging by day
rather than stepping a calendar. `prev_day` and `next_day` are the neighbouring
days that *have* entries, not yesterday and tomorrow, so the arrows never land
on an empty page. That is deliberately the opposite of the carry-forward the
chart does inside its window (046): a chart draws a continuous quantity and a
gap in it is a real day the safe sat there, whereas a page is a thing to read
and an empty one is a dead end.

**A requested date always resolves to a day that exists** — the nearest at or
before it, falling back to the earliest. Type a day with nothing on it into the
date box and the page lands on the nearest real one *and says so*, because a
page that quietly shows a different day than the one asked for is a page that
will be misread as the day asked for.

`<TreasuryDayNav>` replaces `<Pager>` here and borrows from both it and
`<DateNav>`: the disabled-button-not-dead-link rule from the first, the date box
from the second, and `hrefForDay` so the chart's window survives stepping a day.

### The min-width that looked ample and was not

Dropping the date column, the table's `min-w` came down from 46rem to 36rem —
which seemed generous for four columns. It was 100px short. Measured, the
columns need 190px for "Fuel or code transfer" on one line, 146px for the
widest In with its arrow, 164px for the widest Out, and a fixed 176px for the
pinned balance block: **676px, not 576px**. The browser took the shortfall out
of the `whitespace-nowrap` money cells, clipping `Rs 135,000` to `Rs 135,0` and
breaking the reason column one word to a line on a phone. Now 43rem, from the
measurement rather than from how roomy four columns sounded.

## The eighteenth table was never attached, and a documentation audit found it

044 wires `treasury_entries` into the activity log. The copy of 044 that was
applied to the live Supabase project did not include that half — the function
body and the `create trigger` at the end of the file were left off — so on the
live database the trigger covered seventeen tables, not eighteen, and **every
movement of cash in and out of the safe went unlogged**. The repo migration was
right; the applied one was short.

**How it was found is the point.** Not a test, and not the app — nothing looks
wrong when a log is silently not written. It came out of updating the docs
before merging: `README.md` says the activity trigger covers seventeen tables
and 044 claimed an eighteenth, so the number was checked against `pg_trigger`
before the sentence was changed. The database said seventeen.

That is what a count in a doc is *for*. A number a future session will read and
believe has to be checkable, and checking one before rewriting it is cheap. The
lesson generalises past this bug: **when a doc states a count, verify it against
the system rather than against the diff that was supposed to change it.**

Migration 048 applies the missing half. It is a new numbered file rather than an
edit to 044, because a migration that has run is never edited — a fresh database
gets the wiring from 044 and then again from 048, which is harmless since
`create or replace function` and `drop trigger if exists` are both idempotent.

Verified by inserting an entry inside a transaction that then aborts: the log
row reads *"Cash out of the safe | Rs 4,000 · Given — …"*, `pg_trigger` now
reports eighteen tables, and afterwards the table still holds its 36 rows and
Rs 8,364 with no stray log rows left behind.

## Stepping a day stopped throwing the reader to the top

Reported: pressing Earlier or Later on Treasury jumped the page back to the
top every time. It did — a Next `Link` resets the scroll by default, and the
sheet is the last thing on that page, so stepping one day threw the reader up
past the tiles, the chart and both breakdowns to look at a table they were
already looking at.

`<TrendRange>` hit this first and its fix is one word, so this is the same one
word in two more places: `scroll={false}` on the day arrows, and a `scroll`
prop on `<DateJump>` so the date box beside them does not do it either.

`<DateJump>` defaults to `scroll: true`, which is what every existing caller
had. The rule for which to pass: **scroll to the top when the whole page
changes** (Readings, the Dashboard — a different day is a different screen),
**stay put when the control sits at the bottom and only the block above it
changes**, as here.

Worth noting `scroll` is not a prop `Button` knows about. MUI forwards what it
does not recognise to the component it renders as — `PendingLink`, which
spreads onto Next's `Link`, which consumes it. It never reaches the DOM, so
there is no unknown-attribute warning.

**Measured both ways rather than assumed**, because a fix that is already the
default behaviour is indistinguishable from a working one if you only test
after. Without it, `scrollY` went 479 → 0 on Earlier, on Later and on the date
box. With it, 479 on all three, with the day and the day counter changing
underneath — and the chart's `days=14` window carried through each.

## Profit was counting stock bought instead of stock sold

The owner asked why August showed a loss of **Rs 1,464,581** in a month he had
done well in. It was not a display bug. All three reporting RPCs computed:

```
profit = sales − purchases − expenses
```

There is no opening or closing stock in that anywhere. It charges a month for
every litre that *arrived* in it, whether or not any of it was sold.

August is the clearest possible illustration: 49,000 L bought, 43,418 L sold,
including **two 5,000 L petrol loads on the 21st**. The petrol tank went from
854 L on 31 July to 9,610 L. About Rs 1,866,000 of fuel was sitting in the
ground, paid for by August and to be sold in September.

```
profit = sales − cost of goods SOLD − expenses
cost of goods sold = opening stock + purchases − closing stock
```

August becomes **+Rs 566,307**:

| | |
|---|---|
| Sales | 14,984,221 |
| Opening stock (31 Jul) | 2,405,822 |
| + Stock bought | 16,385,110 |
| − Closing stock | 4,436,709 |
| **= Cost of stock sold** | **14,354,223** |
| Expenses | 63,692 |
| **Profit** | **566,307** |

It would not have come right at month end either, which is what made this
worth fixing rather than explaining. The old formula is only correct when
litres bought equal litres sold at the same rate, which is no month; a month
ending with fuel in the tank is understated and one that runs the tanks down is
*overstated*. The errors cancel over years and never within a month.

### Valuing what is in the tank

A litre in a tank has no price tag, so one has to be chosen. Stock is valued at
the **weighted average cost of the deliveries it is actually made of** — walk
that tank's purchases newest-first until its litres are accounted for. Petrol
came out at Rs 332.60/L (the two loads of the 21st plus part of the 18th's) and
diesel at Rs 386.40 (the 18th's delivery), which is exactly what is physically
down there.

**A single flat average over every purchase ever was considered and rejected.**
With rates climbing through August (321 → 336), an average still carrying older
cheap deliveries values a full tank below what it cost and understates profit
for as long as prices rise — a smaller version of the bug being fixed.

Litres older than any recorded delivery — the opening quantity typed into
Settings when the pump joined the app — are valued at that tank's all-time
average rate. That is an estimate and is documented as one; it affects only the
first month that has purchases.

Lubricants get identical treatment. It barely matters today (the shelf turns
over slowly and August restocked nothing) but a half-fixed profit figure is
worse than an unfixed one, because it looks trustworthy.

### One formula, three callers

`cost_of_goods_sold(from, to)` is the only place the arithmetic lives, and
`get_monthly_report`, `get_month_export` and `get_range_summary` all call it —
verified to return the identical figure for the same days, which is the whole
reason aggregation is in Postgres rather than in three page components.

**The three functions were patched, not reproduced in full**, which departs
from how 036, 039 and 044 replaced functions. Those reproduced one function to
add one branch; this changes one expression in three functions totalling about
25,000 characters, none of which is otherwise touched, and three hand-copied
near-duplicates is three chances to silently drop a line from a report nobody
re-reads. Each is read back with `pg_get_functiondef`, has the known expressions
swapped, and is re-declared — and **raises** if the expected text is not found,
rather than reporting success while leaving a wrong profit in place.

### What the page says now

The line under the tiles used to apologise for the figure ("profit counts stock
bought this month, not stock sold — so a big delivery near month end makes it
look low"). That was honest about a formula that was wrong. It now shows the
working instead: opening stock, plus bought, less closing, equals the cost of
what sold. The Excel Summary sheet gained the same three figures and the same
note.

**The register's daily profit sparkline had to change too**, and this is the
part that would have been easy to miss: it computed `sales − stock bought −
expenses` per day in JavaScript. Left alone it would have been *worse* than
before — a delivery day plunging to a deep loss on a line sitting directly
beneath a headline that no longer counts deliveries. It now spreads the cost of
stock sold across the days **by litres sold**, which is exact at the total
(every day's litres sum to the period's, so every day's cost sums to the
period's) and an apportionment within it. Verified: the daily series sums to
566,306.57, the headline to the same.

### Two things caught by rendering it

Both in the new explanation line, both invisible to the build:

- **Money broke across lines.** At 400px the total rendered as "Rs" ending one
  line and "14,354,223" starting the next, which reads for a moment as two
  figures. Every figure in the sentence is now `whitespace-nowrap`: prose
  wraps, money inside prose does not.
- **React dropped one space.** "Rs 4,436,709still there at the end" — one of
  four gaps written as ordinary JSX whitespace came out missing while its three
  identical-looking siblings were fine. Every gap around a figure is now an
  explicit `{' '}`. JSX's rules about whitespace next to an element and a line
  break are subtle enough that "it looks the same as the one above it" is not
  evidence.

## The old end of the activity log can be thrown away

The owner: the activity page grows much faster than anything else in the app,
and a month later most of it is useless. He wanted a button to clear the old
entries.

Which sounds like it contradicts migration 035, whose whole point is that the
log is append-only for everybody, the owner included. It does not, and the
difference is worth writing down, because it is the difference between a trail
that is worth something and one that is decoration:

- **A line may never be EDITED.** That is untouched, for everyone, always. The
  UPDATE half of the guard is exactly as it was.
- **A line may never be picked out and removed on its own.** That is the half
  that would have made the trail worthless — remove the one line about the
  payment somebody backdated on Tuesday, leave Monday and Wednesday, and the
  log now lies by looking complete.

So what shipped is a coarse, whole-period trim and nothing finer. The dialog
offers four choices and they are all "how much to KEEP": the last month, three
months, six months or year. The cutoff date is computed in Postgres from
`pump_today()`, not sent from the browser, so no caller can ask for "everything
up to five minutes ago"; the most recent month can never be cleared whatever is
asked for; and the trim writes its own line into the log it just trimmed,
naming who did it and how many entries went. Migration 050.

**The append-only guard was not disabled to do it.** It learns one named
exception, `app.trimming_activity`, set only by `clear_activity_log()`, only
for the length of its transaction, and even then it refuses any row that is not
older than the cutoff the setting names — so the setting alone does not open
the table, it only opens the far end of it. This is the same shape as
`app.purging_customer` in migration 033 and for the same reason: a stray DELETE
from PostgREST, from server code, or from a later refactor meets the refusal it
always did, because none of them set it.

**Each period says how many lines it would take**, from
`activity_log_trim_counts()`, which returns all four counts and the span of the
log in one round trip. "Older than six months" is a tidy-up at 4 lines and a
decision at 4,000, and the owner cannot tell which one he is agreeing to
without the number. The counts and the delete share one cutoff function, so the
figure shown and the rows that actually go cannot drift apart. The dialog
defaults to the largest period that would actually remove something — somebody
opening it has too much log, not too little — and a period with nothing older
than it is drawn disabled rather than hidden, so the four options stay in the
same places.

**Tested on a local Postgres** against a shim of the 035 schema rather than the
live project: staff refused on both functions, an out-of-range period refused,
a direct DELETE and any UPDATE still refused, the trim removing exactly the
rows older than its cutoff, the log line it writes about itself, a second trim
in a row reporting nothing to do and writing no line claiming otherwise, and
the transaction-local setting not surviving into the next statement.

## The active section carries a dark bar

The tinted band and the greener label already said which section was open, but
both are soft, and on a cheap tablet in daylight the `brand-50` fill washes out
to the same white as the rest of the column — at which point nothing on screen
says which of thirteen sections is showing. Each active row now ends with a
short dark bar (`ActiveMark` in `AdminSidebar.js`): `ml-auto` so the markers
line up down the column's right edge whatever the label's length, and
`brand-800`, which is the darkest thing in the nav and sits somewhere no other
row has ink at all. It reads as a marker rather than as one more pale wash.
Decorative only — `aria-current="page"` on the link is what a screen reader is
told, and the mark is `aria-hidden`. It is on the phone drawer's rows and on
Account as well as the sections, checked at 1152px and 400px.

## The books can leave Supabase, and come back

The owner asked the question that had not been asked in fifty migrations: if he
lost access to the Supabase account, could he stand a new project up and put
everything back? At the time the honest answer was no. The project is on the
free plan — no daily backup anybody can restore from, and a pause after a week
of inactivity — and the only export was the Excel workbook, which is a report:
one month, laid out for reading, with no way back into a database.

So: **Download backup** at the foot of Reports, and a recovery script beside it.

> Read later: the panel moved to **Settings** a day afterwards, on the owner's
> instruction — see "The backup panel belongs on Settings, not Reports" below.
> The route moved with it, to `/admin/settings/backup`.

**What is in the file.** Every table, in dependency order, as one JSON
document. Two things are left out on purpose. The activity log's ROWS, at the
owner's request — it is the largest table, nothing depends on it, and it
answers "what happened last week" rather than "what are the books"; the table
and its trigger still come from migration 035, so a restored project writes new
lines from its first save. And the profiles, because a profile row is half of a
login and the other half lives in `auth.users`, where passwords are hashes no
API hands out. The names ARE exported, which is what lets a restore put each
entry back under the person who made it.

**Why the loading is a database function rather than a loop in JavaScript.**
This is the part that would have been easy to get wrong and hard to notice: the
schema is not a passive store. A credit slip auto-posts its own ledger entry —
reload both through the normal path and every credit customer's balance
doubles. Tank and lubricant stock are recalculated per row, from a table that
is only partly loaded. Readings may not overlap, a day must balance, and the
safe may never go below zero at any point in the chain — all true of the
finished data, and not necessarily true half way through loading it in table
order. `restore_everything()` therefore disables user triggers for one
transaction, loads parents before children, turns them back on, and recomputes
the two derived stock figures itself.

**It refuses a target that already holds trading data**, and names the tables.
Merging two books is not something to ask a script to attempt, and "restore
over the top of what is there" is how a stale backup destroys a good database.

### Three things only found by actually restoring

The round trip was run for real against a local Postgres with every migration
then in the repo applied (through 051): seed a database through the normal path, export, wipe,
rebuild from the migrations, restore, and diff every count, money total,
customer balance, stock figure and trigger state. It came back identical — but
only after three things that reading the code would not have caught:

- **A fresh project is not empty.** Migration 045 seeds the owner's real 36
  treasury movements, on top of the tanks and nozzles from 004/012/013. The
  first restore into a freshly migrated database was refused by its own
  emptiness check. Hence `backup_seeded_tables()`, which names what the
  migrations put there and is cleared and replaced by the file's own copy.
- **`treasury_entries.seq` is an identity column, and it is load-bearing.** The
  safe's running order is `(entry_date, seq)`, so letting Postgres hand out
  fresh values would silently reorder two movements made on the same day. The
  restore writes the old values with `overriding system value` and then moves
  the sequence past them, or the next entry after a restore would collide.
- **A restore that returns nothing must say so.** With a 200 carrying no
  result, the script went on to its checks and reported all seventeen tables as
  mismatched — seventeen alarming lines for a load that never started. It now
  stops and says the load did not happen.

**The script's own failure paths were exercised too**: a project with no logins
yet, an author with no matching login (restored with nobody against them, and
said out loud), a file whose header disagrees with its rows, a file from a
future schema version, and a target that already has data.

One honest limitation, recorded because a future session will want to know: the
script's HTTP path was exercised against a small stand-in for PostgREST backed
by the real database and the real restore function, because Docker Hub is
unreachable from this environment and the genuine article could not be run. The
database half of the round trip is tested for real; PostgREST's own routing is
the one thing standing in for itself.

## A download's failure outlived the failure

Reported from the live app, and it had been true of the Excel export since the
day it shipped — nobody had noticed because nobody had failed an export and then
succeeded at one.

A download is a plain link, not a form. When it works, the browser saves the
file and the page never re-renders; when it fails, the route redirects back with
the reason in the query string. So the reason stays in the URL. Migration 051
was applied, the backup downloaded correctly — and the red line still read
"Could not find the function public.export_everything", because
`?backup_error=…` was still in the address bar and the server was faithfully
rendering it on every request.

`<DownloadNotice>` fixes both banners. It shows the reason, then strips its own
parameter out of the URL with `history.replaceState` — not `router.replace`,
which would re-fetch the whole Reports page, charts and RPCs and all, to remove
one query parameter. It carries a Dismiss button, and the panel clears it when
the download button is pressed again, since the answer to the old failure is the
attempt now in flight.

This is the `<Toast>` rule arrived at from the other end. Successes go in a
toast because a message that outlives what it describes starts describing
something else; errors deliberately do not, because an error has to survive long
enough to be read and acted on. What was missing was the third case: an error
that has survived long enough, and is now false.

Verified in a browser rather than reasoned about: shown on arrival, gone after a
refresh, gone on Dismiss, gone when Download is pressed again.

## The backup panel belongs on Settings, not Reports

It shipped at the foot of Reports on the reasoning that both it and the Excel
workbook are files you take away. The owner moved it, and he is right: Reports
is where you go to READ a figure, and a control about losing the whole database
has no business sitting under the month's profit. Settings is where the things
that are set up once and then left alone live — the rates, the tanks, the nozzle
wiring, the reset panel — and a backup is one of those.

The route moved with it (`/admin/settings/backup`) and its failure redirects to
Settings, because a message has to land on the page the reader pressed the
button from.

## Where the restore stands, for whoever picks this up next

The plan, in the owner's words: clone the repo, run all 51 migrations on a new
Supabase account, and test the restore. Everything needed for that is in
`README.md` → "Backups, and restoring from one"; the short version of what
changes for a clone is **nothing in the SQL** — no hardcoded project ref, no
hardcoded ids or emails, `pgcrypto` created by 001, and the `auth.users →
profiles` trigger created by 002 rather than by hand in the dashboard — only the
three environment variables, and the owner login made by hand and promoted to
`super_admin` with one UPDATE.

**Proved:** the whole round trip against a local Postgres with all 51 migrations
applied — export, wipe, rebuild, restore, and an identical diff of every count,
money total, balance, stock figure and trigger state, both through
`restore_everything()` directly and through `scripts/restore-backup.mjs` with
the authors remapped onto different login ids. Also the refusals: staff, a
non-empty target, a wrong confirmation word, a future schema version, a damaged
file, a project with no logins, and an author with no matching login.

**Not proved yet:** any of it against a real Supabase project. The three things
most likely to behave differently are the ones Supabase owns rather than
Postgres — whether `service_role` reaches `restore_everything` through PostgREST
as the `current_user` check expects, whether a payload of a few hundred KB
survives the RPC endpoint unaltered, and the `auth.users` half of remaking the
logins. If the rehearsal turns any of those up, the fix belongs in migration 051
and this file, not in a workaround in the script.

## The days-as-a-table block became a button and a modal

Owner's request, and it fixes three things at once. The month-by-day table was a
`<details>` card under the charts: no button, no border, just a line of text and
a triangle, so it read as a strip of furniture rather than something to press.
It sat below the charts — the table is what you reach for when the chart is not
answering your question, so the alternative was hidden underneath the thing that
had failed you. And opening it pushed a nine-column table into the middle of a
page that already carries a stat strip and two charts, moving everything below
it.

It is now a **Show these days as a table** button in the heading row, on the
right, above the charts, opening `<DailyTableDialog>` — a modal at a new
`size="xl"` (64rem), because the table is nine columns and 46rem at its
narrowest and `lg` fits it only by giving up its own padding. Rendered at 1152px
and 400px: the full table fits without sideways scrolling on a laptop, and on a
phone it scrolls inside the sheet the way every other wide table in the app
does.

The dialog is a client component holding a SERVER-rendered child.
`<DailySalesTable>` formats through `helpers.js`, which reads request cookies
for the role checks and cannot be pulled into a client bundle, so the finished
table is passed as `children`. Worth knowing before writing the next modal that
needs server-rendered content in it.

# Porting the Treasury → Backup → paisa → recovery-row rounds to the offline (Electron) build

The desktop build tracks this repo, and the last catch-up list above stops at
migration 043. This is the next one: **migrations 044–053 and everything that
came with them**, sorted by what a port has to do about it rather than by the
order it happened in. Every "why" is in the sections above; this is the list of
what to carry.

## 1. Database — ten migrations, and only one of them is Supabase-shaped

| Migration | What it is | What a port has to do |
|---|---|---|
| `044_treasury.sql` | The safe on site: `treasury_entries`, the `treasury_ledger` view, the never-negative rule, owner-only RLS, and the **18th** table on the activity trigger | **The hardest one in this round.** See below |
| `045_treasury_opening_entries.sql` | The owner's real 36 movements to 21 Aug 2026, with an assertion that rolls the whole thing back if they do not total Rs 8,364 | Data, not schema. Apply it, or the offline books start empty where the live ones do not |
| `046_treasury_series_ends_at_the_last_entry.sql` | The chart stops where the entries stop | Read function. Plain SQL |
| `047_treasury_a_page_is_a_day.sql` | `treasury_day()` — one day per page, with the neighbouring days that *have* entries | Read function. Plain SQL |
| `048_treasury_in_the_activity_log.sql` | Repair: 044 wires `treasury_entries` into the activity log and the copy applied to the live project did not include that half | **Check `pg_trigger` in the offline database too.** The bug was a partially-applied migration, which is exactly what hand-copying SQL between two databases produces |
| `049_profit_counts_stock_sold.sql` | Profit counts stock SOLD, not stock bought | Already covered in `README.md` → "If you are porting this off Supabase". Not purely declarative: it reads the earlier definitions back with `pg_get_functiondef`, so 005/010/041 must be present and unedited |
| `050_clear_the_old_activity_log.sql` | The owner can throw away the old end of the audit trail | Plain Postgres — `set_config`/`current_setting` for the transaction-local exception, `at time zone 'Asia/Karachi'` for the cutoff. Needs 035's append-only guard to exist first, since it replaces it |
| `051_backup_and_restore.sql` | The whole book out as JSON, and back into an empty database | **Skip it.** The desktop build already backs itself up its own way — see below |
| `052_the_database_works_out_the_cash.sql` | A reading would not save: the app computed the cash in a float and the database computed the sale in `numeric`, and on a half-paisa they differed by one | **Take this one, and take the JavaScript with it.** It is not Supabase-shaped at all — the same `numeric` versus double mismatch exists in any Postgres, and the desktop build runs the identical `create_nozzle_reading()` and the identical entry dialog. `saleAmount()` in `format-helpers.js` goes across too, or the figure on screen and the figure in the books differ by a paisa |
| `053_expense_recovery_rows.sql` | `expenses.amount` relaxed from `check (amount > 0)` to `check (amount <> 0)`, so a reimbursement against a past bill can be stored as a negative row in the same table | **Plain SQL, one `alter table`.** Nothing Supabase-specific — take it, and take `createExpense`'s relaxed validation (`app/_lib/actions.js`) and the Paid out/Recovered toggle (`ExpenseForm.js`) with it |

### 044 is the hard one, and the reason is two Postgres features

If the desktop build ships **its own Postgres**, 044 applies verbatim and there
is nothing to do. If anything ever replaces Postgres with SQLite or similar,
these two do not survive the swap and the safe stops being trustworthy quietly:

- **A DEFERRED constraint trigger.** The rule is "the safe may never hold less
  than nothing **at any point in the chain**", judged at COMMIT, not per row —
  because entries arrive in any order and a mid-transaction state that dips
  below zero is not a violation if the finished chain does not. SQLite has no
  deferred constraint triggers. Re-implementing it per-row rejects legitimate
  entries; leaving it out lets the safe go negative.
- **A window function.** `treasury_ledger` carries the running balance as
  `sum(...) over (order by entry_date, seq)`, and `treasury_day()` uses the same
  window twice. Computing a running balance in JavaScript instead means the
  page and the constraint can disagree about what the balance is, which is the
  one thing this table exists to prevent.

Also: `treasury_entries.seq` is `generated always as identity` and **the order
of a day depends on it**. Anything that copies these rows must preserve it — see
what 051 had to do below.

### 051 is the one NOT to port

**The desktop build already has backups, done its own way, and this migration is
not for it.** A local Postgres on one laptop has options this repo does not —
copying the data directory, a `pg_dump` on a timer, the installer's own
mechanism — and they back up the whole database including the logins, which the
JSON export deliberately cannot. Do not port `export_everything()`,
`restore_everything()`, `scripts/restore-backup.mjs`, the Settings panel or the
download route. Apply the migration only if the offline database is ever asked
to produce the same portable JSON file for some other reason.

Two things in it are still worth reading, because they are about THIS SCHEMA and
apply to whatever the offline build's own restore does:

- **A reload through the normal write path corrupts the books.** A credit slip
  auto-posts its own ledger entry, so re-inserting both doubles every credit
  customer's balance. Tank and lubricant stock are recalculated per row and will
  be computed from a half-loaded table. The balanced-day, no-overlap and
  never-negative rules are true of the finished data and not necessarily true
  part-way through loading it in table order. A file-level or `pg_dump` restore
  sidesteps all of this by not going through the write path at all — which is
  precisely why it is the better tool offline. Anything that DOES replay rows
  needs triggers off for one transaction, parents before children, and the
  derived stock figures recomputed at the end.
- **A freshly migrated database is not empty.** 004/012/013 seed the tanks and
  nozzles, 045 the 36 treasury movements. Any restore that expects a blank slate
  has to account for them.

And one thing to leave behind: `restore_everything()` guards on `current_user`
being `service_role`, `postgres` or `supabase_admin` — the role PostgREST
switches into. That is Supabase's shape, it means nothing offline, and it is
another reason not to carry this function across rather than to adapt it.

## 2. New files

| File | Purpose |
|---|---|
| `app/admin/treasury/page.js` + `loading.js` | The safe, a day per page |
| `_components/admin/TreasuryEntryForm.js` | `'use client'`. Record cash in or out, category per direction |
| `_components/admin/TreasuryDayNav.js` | `'use client'`. Steps to the previous/next day that HAS entries |
| `_components/admin/TreasuryBalanceChart.js` | `'use client'`. The running balance |
| `_components/admin/DeleteTreasuryEntryButton.js` | Removing one line from the chain |
| `_lib/treasury-categories.js` | The fixed reason lists, per direction |
| `_components/admin/ClearOldActivityButton.js` | `'use client'`. Whole-period trim of the activity log (050) |
| `_components/admin/BackupPanel.js` | `'use client'`. The backup download, on Settings |
| `app/admin/settings/backup/route.js` | Route handler: the whole book as a JSON download |
| `scripts/restore-backup.mjs` | The recovery script — see above |
| `_components/ui/DownloadNotice.js` | `'use client'`. A download's failure that takes its own query parameter out of the URL |
| `_components/admin/DailyTableDialog.js` | `'use client'`. A client shell holding a SERVER-rendered table |

## 3. Changed shared files — these reach more than one page

- **`_components/ui/Dialog.js`** — `size` now takes `xl` (64rem) as well as
  `lg` and `md`, for a table that is wide in its own right.
- **`_components/admin/AdminSidebar.js`** — `ActiveMark`: the open section ends
  with a dark bar, in the column and in the phone drawer, because the tinted
  band washes out on a tablet in daylight.
- **`_components/admin/AdminStats.js`** — a `treasury` accent (teal: the safe's
  balance is a level, not a movement), and the sparkline yields the line rather
  than disappearing below the threshold.
- **`_components/admin/DateJump.js`** — `scroll` prop; pass `scroll={false}`
  where the date box sits at the BOTTOM of a page, as Treasury does.
- **`_components/admin/CategoryBreakdown.js`** — optional `title`, because
  Treasury renders two side by side (where cash came from, where it went).
- **`_lib/fuel-colors.js`** — `deepHex`, a bare hex for a chart fill.
- **`_lib/helpers.js`** — `/admin/treasury` in the page-role table.
- **`_lib/data-service.js`** — `getTreasuryOverview`, `getTreasuryDay`,
  `getActivityTrimCounts`.
- **`_lib/actions.js`** — `createTreasuryEntry`, `deleteTreasuryEntry`,
  `clearOldActivity`; `createExpense`'s amount check relaxed to reject only
  zero, not negative (053).
- **`_components/admin/ExpenseForm.js`** — moved from a standing sidebar form
  to an `Add expense` button behind a dialog, on the same `useActionState` +
  `handled` ref + `<Toast>` shape as `BankAccountForm`. Gained a Paid out/
  Recovered toggle inside the dialog, styled like Treasury's Cash in/Cash out
  (`moneyOut` amber / `moneyIn` brand green, not `BalanceDirection`'s single
  "whichever is picked" highlight, so Recovered keeps the same green here it
  wears in the table below); picking Recovered negates the typed amount before
  it is submitted.
- **`app/admin/expenses/page.js`** — the sidebar-form grid became a single
  full-width column now that `ExpenseForm` lives behind a dialog triggered from
  `PageHeader`; a third StatTile, `Recovered in [month]`, sits beside Spent and
  Categories used. A negative-amount row (a recovery) draws in brand green with
  the `moneyIn` icon and a "Recovered" tag, the same colour-plus-icon
  distinction Treasury draws between cash in and cash out.
- **`_lib/excel-report.js`** — the workbook's Summary sheet gains cost of stock
  sold, opening and closing stock value (049).
- **`_components/ui/Icon.js`** — a `treasury` icon.

## 4. Page changes

| Page | Change |
|---|---|
| Treasury | New section, owner-only, a page is a day |
| Activity | **Clear old entries** — whole retention periods only, counts per period, the trim logs itself |
| Settings | **Backup** section: download the whole book |
| Reports | The month's days moved from a `<details>` block under the charts to a button above them opening a modal; profit is now sales − cost of stock sold − expenses, with the working shown |
| Nav | The open section carries a dark bar |

## 5. The rules worth carrying over, not just the diffs

- **A partially-applied migration is the failure mode of hand-copied SQL.**
  048 exists because 044 was applied to the live project without the half that
  wires treasury into the activity log. It was found by checking a number in
  the docs against `pg_trigger`. Do that check on the offline database too.
- **Append-only means "no line may be EDITED", not "no line may ever leave".**
  050 lets the owner drop whole retention periods and nothing finer, because
  removing one line while its neighbours stay is what makes a trail lie.
- **A backup nobody has restored is a guess.** The round trip here was proved
  by doing it against a local Postgres — export, wipe, rebuild from the
  migrations, restore, diff every count, total, balance and stock figure. The
  offline build backs up its own way and does not take this feature, but the
  discipline transfers: rehearse ITS restore on a copy, and check the figures
  afterwards rather than trusting that the file is good.
- **A download that fails leaves its reason in the URL, and the reason outlives
  the failure.** A successful download does not re-render the page. Whatever
  the offline shell does for downloads, the notice has to be able to go away.
- **A modal can hold a server-rendered child** — pass it as `children`. Anything
  that formats through `helpers.js` cannot be imported into a client component,
  because that file reads request cookies.

## One paisa stopped a reading being saved

Reported from the pump: Unit 1 Nozzle A, 23 Aug, diesel. Opening 1,990,670.61,
closing 1,990,868.36, rate Rs 371.90 — and *"Cash plus credit does not equal the
amount sold. Check the figures and try again."* Every figure on the screen was
correct. Entering the same reading without the decimals worked.

**What was actually happening.** 197.75 litres × Rs 371.90 is exactly

    Rs 73,543.2250

a half-paisa, sitting precisely on the rounding boundary.

- **Postgres** works in `numeric`, which is exact, and rounds half away from
  zero: **73,543.23**. `sale_amount` is a generated column, so that is what the
  database had.
- **JavaScript** works in a binary double, where the same product comes out as
  **73,543.224999999991**, and rounds to **73,543.22**. That is what the app
  sent as the cash.

`nozzle_readings_split_matches_sale` compares cash + credit against
`round((closing - opening) * rate, 2)` and refused the row over the paisa. The
error message was accurate and completely unactionable: no amount of re-typing
could fix a figure the app was computing itself.

**Why "without points" worked.** A whole number of litres times a two-decimal
rate has at most two decimals, so it can never land on a half-paisa. Decimals
can, and the owner's meter produces them.

**How often.** Measured against the 25 rates this pump has actually charged, by
running the app's own `roundMoney` against exact integer arithmetic for every
two-decimal litre figure from 0.01 to 2000.00:

| | |
|---|---|
| Rates that can produce it | **13 of 25** |
| Worst rate (Rs 389.50, diesel) | 13,895 of 200,000 litre values — **6.95%** |
| The rate on the day (Rs 371.90) | 7,618 of 200,000 — **3.81%**, about one reading in 26 |
| Rates that are clean | 12 of 25, including Rs 339.48 and Rs 331.16 |

So this had been happening for weeks, on both fuels and every nozzle, and looked
random because it is: it depends on where the float falls relative to the tie.
Four readings already in the books sit exactly on a half-paisa and saved fine —
those are the ones where the double happened to land on the high side.

### The fix is that the app stops sending the number

Rounding "more carefully" in JavaScript would be the same bet placed again, by
whoever next writes a figure the database also computes. `p_cash` was the last
value in `create_nozzle_reading()` the caller was trusted for — and the credit
total beside it had already been moved into the function years earlier, with the
comment *"so the two can't disagree"*. Migration 052 extends that to the cash:

    v_sale := round((p_closing - p_opening) * p_rate, 2);
    v_cash := v_sale - v_credit_total;

the identical expression to the generated column and the check constraint, so
all three now agree by construction rather than by luck. Cash was never
independent information — it is what is left after the slips.

`p_cash` stays in the signature and is ignored, because dropping it would break
every deployed copy of the app the moment the migration lands.

**"Slips come to more than the nozzle sold" moved into the function too.** That
check used to live only in the Server Action, which no longer computes the
authoritative sale — and if it had been left to the constraint underneath, a
genuine mistake would have been reported as "the figures do not add up", sending
the reader to look at the meter instead of at the slips.

### The app still does the arithmetic, and now does it exactly

The screen has to show the figure that is about to be saved — the cash-in-hand
number is checked against the notes in the drawer before saving, and being a
paisa out from the books would be its own small betrayal. `saleAmount()` in
`format-helpers.js` scales both sides to integers, multiplies exactly, and
rounds half away from zero the way Postgres does. Used by the entry dialog, the
Server Action's guard and message, and the lubricant sale form — which derives
its amount from litres × rate the same way and could store an amount a paisa off
(never refused, because the constraint there compares the split against that
same figure, so both sides shared the error).

Litres are scaled by a **thousand**, not a hundred: nozzle litres are two
decimals, but loose oil is measured to three, and a helper that quietly rounded
12.345 litres before multiplying would have been a worse bug than the one it was
written to fix.

### Verified, twice

- **Locally**, against a Postgres with all 52 migrations: the exact failing
  reading now saves and stores sale 73,543.23 / cash 73,543.23; a wildly wrong
  `p_cash` is ignored; over-slipped readings are still refused with the sentence
  about slips; a reading with slips still balances.
- **On the live database**, by calling the function with the owner's real
  figures inside a transaction that raises at the end — so the proof is in the
  error message and nothing was written. Confirmed afterwards that no row was
  left behind.

### The rule this leaves behind

**Never compute in JavaScript a money figure the database also computes.**
Derive it in Postgres and let the app read it back. Where the app must show it
before saving, compute it with integer arithmetic that matches `numeric`, never
with `*` on floats. A generated column plus a check constraint is a promise that
the two ends agree; a float is a wager that they will.

## A partial reimbursement can be recorded against an expense

**The problem.** The owner pays the full electricity bill upfront — a real one
was Rs 20,000 — and shares the connection with three or four neighbours, who
pay him back one at a time over the following days. Until now the only record
was the Rs 20,000 expense. Every rupee paid back was invisible: profit was
understated by whatever came back, permanently, with no way to enter it.

**The design, and what it was weighed against.** The obvious "correct" shape is
a small receivables system — a table of bills, linked repayments, a running
"outstanding" balance per bill. That is the right answer for a business that
tracks who owes what reliably. It is the wrong size for a petrol pump recording
a handful of Rs 500–1,500 repayments a month, read by an owner checking figures
on a tablet against cash in a drawer. A second table is a second thing to get
right — its own RLS policy, its own place for `sum()` to remember to look — and
buys nothing that a much smaller change does not already buy.

**What shipped instead: a recovery row.** `expenses.amount` was
`check (amount > 0)`; migration 053 relaxes it to `check (amount <> 0)` (zero is
still refused — it is not a real event either way). A reimbursement is recorded
as an ordinary expense row with a **negative** amount: same table, same category
("Electricity"), dated the day the cash actually comes back. No new table, no
linked ledger, no trigger.

**Why this nets out for free.** `sum(e.amount)` already runs unfiltered in three
places — the month tile on `/admin/expenses`, `CategoryBreakdown`'s per-category
totals, and both reporting RPCs (`005_reporting_rpcs.sql`'s monthly report and
`010_month_export_rpc.sql`'s Excel export). A negative row cancels out of a sum
by construction, so every one of those figures is correct **with no code
change** — the whole reason a negative amount was the right shape rather than a
`is_recovery` flag needing to be subtracted everywhere a total is built.

**Cash basis, on purpose, and not a new rule.** The reimbursement is recorded
when the neighbour actually hands the money over, not accrued against the
original bill the day it was paid. Treasury entries and credit sales already
work this way — recorded when the cash moves, never when it becomes owed — so
this is the same rule applied to a third place, not a new one invented for it.

**The app-side changes.** `createExpense` in `app/_lib/actions.js` rejected
`amount <= 0`; it now rejects only `amount === null || amount === 0`, so a
negative reimbursement passes through to the constraint above. `ExpenseForm`
never asks anyone to type a minus sign — a tablet's on-screen numeric keypad
usually has no key for one — so the amount field always takes a positive
magnitude, and which sign gets applied is decided by which of two buttons
opened the dialog (see "Two buttons, not a toggle" below), negated in
`FormData` right before `createExpense` runs. `min="0.01"` stays fixed either
way, because the field never has to represent both signs in one instance any
more.

**Reading it back.** A raw `formatPKR(-5000)` prints "Rs -5,000", which reads as
a typo before it reads as a direction — see "A signed money row needs colour
and an icon, not a minus sign" in `docs/UI_CONVENTIONS.md`, the rule this
entry's table now shares with Treasury's Cash in/Cash out columns. A recovery
row shows the **magnitude** in brand green beside a `moneyIn` icon, with a small
"Recovered" tag next to its note, rather than the signed figure.

**Verified**, twice — once for the standing-form version, again after the
rework above — by rendering `/admin/expenses` with a fixture month (the real
Rs 20,000 electricity bill plus three neighbour repayments, Rs 3,500 / 3,000 /
2,500, in the same category, alongside ordinary Salaries/Rent/Maintenance rows)
through a disposable devcheck route, screenshotted at 1152px and 400px both
times. The second pass also clicked **Add expense** open and screenshotted the
dialog itself. The month tile read the net Rs 11,000 for Electricity correctly
throughout with no code changes to the total or the breakdown, the new
Recovered tile read Rs 9,000 / 3 repayments, and the three recovery rows stayed
readable as money coming back rather than as mistakes at both widths, and with
the table now full-width instead of squeezed beside the old sidebar form.

**Applied to the wrong Supabase project first — a genuinely useful mistake to
write down.** Before adding 053, the live project was checked against
`supabase/migrations/` rather than assumed to match, the same discipline this
repo asks of live data — but "the live project" was taken to mean whichever one
`list_projects` returned, without cross-checking it against `.env.local`, the
file the app actually reads its connection from. The two were different
projects. 052 was applied to the wrong one, appeared to be "missing" there
(because it genuinely was, on that project), and got applied a second time
before the mix-up was caught — by a check constraint refusing a live Rs 1 test
entry with the OLD `amount > 0` message, which was the tell: 053 had reported
success, so the only way the old constraint could still be firing was that it
was answering from a different database than the one that had just been
migrated. `.env.local`'s project ref settled it, and reconnecting the Supabase
session to the account that actually owns that project confirmed 052 was
already there (the owner's own memory of applying it was right) and only 053
was missing. **The rule this leaves behind: match a project by its ref against
`.env.local` (or the deploy's env vars) before treating any "the live
database" as settled, never by name or by "it's the only one the tool
returned" — a second Supabase account with its own project of a similar name
is exactly the case a name-only match cannot catch.**

**Reworked mid-review: a dialog instead of a standing form, and a third
tile.** `ExpenseForm` stood open on the page beside the table when this shipped
first, on the reasoning "recording an expense is the reason this page is
opened" — and two things about actually using it argued the other way. Its
success message used a bare `<FormMessage>`, so "Expense recorded." sat in the
form through the next entry, the exact failure `<Toast>` exists to prevent (see
`docs/UI_CONVENTIONS.md`'s "A date-driven page does not remount" and every
dialog form's own comment on this). And a permanent 22rem sidebar column for a
four-field form was the same trade `BankAccountForm`'s own comment already
describes making the other way, for the same reason: a rare-ish job (well,
daily here, but not the reason the page is loaded at that exact moment) does
not need to cost the page its width every time it is open. `ExpenseForm` is now
`Add expense` behind a dialog, built on the same shape as `BankAccountForm` —
`useActionState` plus a `handled` ref that closes the dialog and raises a
`<Toast>` exactly once per successful submission, `<FormMessage>` guarded by
`state?.ok === false` so it never renders a stale success. The Paid out/
Recovered toggle moved inside the dialog at this point, unchanged from before -
see the next entry for where it actually ended up.

A third StatTile, **Recovered in [month]**, was added beside Spent and
Categories used — `moneyIn` icon, brand green, the recovered rows' total and
count. `total` already nets recoveries out of "Spent" silently by construction
(that is the whole point of the negative-row design above); the reader checking
the month needs the two movements shown separately to see WHY the net figure is
what it is, not just trust that it is. No new query - `recoveries` is the same
`expenses` array the page already has, filtered by sign.

**Reworked again: two buttons instead of a toggle.** The Paid out/Recovered
switch inside one dialog was itself the wrong shape, once there was a dialog to
put it in — a mode that has to be set correctly before typing the amount is
exactly the kind of choice that gets missed under pressure, with nothing
catching a wrong pick until the row is already the wrong sign in the table.
`ExpenseForm` takes a `kind` prop ("paid" or "recovered") now, fixed for the
life of one instance, and the page renders two of them: **Add expense**
(`moneyOut`, `primary` — the common case) and **Add recovery** (`moneyIn`,
`secondary`). Each is its own button and its own `<Dialog>`; there is nothing
left inside either form that can be set to the wrong thing, because the choice
was which button got pressed, not a field inside what opened. Every id inside
the form is prefixed with `kind` (`idFor('amount')` → `paid_amount` /
`recovered_amount`) since both instances are mounted on the page at once — only
one dialog is open at a time, but both exist in the DOM throughout. See "Two
buttons, not a toggle" in `docs/UI_CONVENTIONS.md` for the general shape of
this: a choice between two options is not always a control to put inside a
form — sometimes it is a choice of which form to open.

## Settings: a dialog for the rare edit, full colour for the figures that matter

`FuelPriceForm` stood open beside the two current-rate cards, the same
standing-form pattern this file has already been retiring page by page
(`BankAccountForm`, then `ExpenseForm` two entries up). Same move again: **Set
a new rate** behind a dialog, `useActionState` + a `handled` ref that closes
the dialog and raises a `<Toast>` once per success, `<FormMessage>` guarded by
`state?.ok === false`. It also picked up the warning icon and sentence about
sales before the effective date that used to be a plain caption under the
date field — small, but it is the one line in the form saying past readings
are untouched, and a dialog is worth a beat of extra reassurance a standing
form was not.

**The two rate cards went the other way — louder, not quieter.** This is the
figure an attendant checks before every single reading, on a cheap tablet,
sometimes in a hurry, and it was a `text-2xl` number in a plain white card with
a small badge — no louder than "Categories used" on the Expenses page, for a
number that matters far more. Now: `fuel-colors.js`'s `solid` fills the WHOLE
card (petrol's dark blue with white text, diesel's light orange with dark
text — the Readings unit header and the Stock dip cards' own colours, so a
reading, a tank and its price are the same colour wherever they appear), the
`.fuel-band` sheen the rest of the app already uses for a filled fuel surface,
and the rate itself set at `text-4xl`/`text-5xl` — bigger than any other figure
on the page. `FuelBadge` was dropped from the card: the whole surface is
already the fuel's colour, and the label sits right beside the icon in the
band, so a separate chip would be the third statement of the same fact (see
"Drop a badge the band has made redundant", above).

**This reads as a deviation from "the colour is on the header and border
only" and is not one** — see the addendum after "Two entry cards side by
side" in `docs/UI_CONVENTIONS.md`. That rule protects a figure being TYPED
from a colour wash stealing its contrast; nothing is typed into these cards
any more (the form moved to a dialog in the same pass), and `solid`'s
petrol/diesel pairs are already the ones measured for text-on-fill at this
exact job (7.6:1, 10.6:1) — the rate is the fill's own text, not something
layered on top that could lose contrast to it. A card with no rate set is
deliberately NOT fuel-coloured — a confident blue or orange card for a price
that does not exist would be worse than the plain grey it replaced — and stays
dashed-amber, the app's usual "needs attention" language.

**Verified** by rendering the new cards, the dialog, and the "not set" state
through a disposable devcheck route at 1152px and 400px: both fuels' figures
stayed legible and un-wrapped at both widths, the dialog opened cleanly over
the coloured cards, and the not-set card read as distinctly unfinished rather
than as a third fuel colour.

### A rounded corner clipped a child, not a colour - the seam was in the markup shape

First render had a hairline of the card's white background showing through
the bottom corners of the filled rate cards - visible in a screenshot,
invisible in the DOM (`scrollWidth`/`clientWidth` had nothing to say about it,
because nothing was overflowing). The markup was `card unit-card
overflow-hidden` on the outside and a separate `fuel-band ... solid` div
filling it as a child - the same shape the Readings unit header uses, where it
never showed because that header is only a strip at the top of an otherwise
white card. Here the coloured child filled the WHOLE card, and at the rounded
bottom corners the parent's clip and the child's own rectangular edge did not
perfectly agree at the pixel level - a sub-pixel anti-aliasing seam, the kind
of thing that only appears once a colour reaches all four corners of a
rounded box.

**The fix is putting the colour and the rounding on the SAME element** rather
than clipping a coloured child into a rounded parent: one div carrying `card`
(the rounding), `fuel-band` (the sheen) and `color.solid` (the fill) together,
no `overflow-hidden`, nothing left to clip. The general lesson: a fully-filled
rounded surface should own its own border-radius, not inherit one by being
clipped inside it — reserve the parent-clips-child shape for when the colour
is only PART of the card (a header strip, e.g. the Readings unit header),
where the seam has nowhere to become visible because the rest of the card is
already the background colour.

### `.rate-card`: a second "solid object" shadow, under its own name

The filled rate cards wanted the same lifted, tactile shadow the Readings
unit card wears (`.unit-card` - four stacked shadows plus a white inset
highlight, not one blur; see that class's own comment in `globals.css` for
why four and not one) rather than `.card`'s quiet default. Reusing
`.unit-card` directly was rejected: its own comment says the elevation is
deliberately reserved for "the one thing on the page worth making a solid
object... if everything were lifted this far, nothing would read as lifted at
all" — a restraint rule about not diluting the effect, and a class literally
named for the physical pump unit showing up on a page with no pump on it
would mislead the next reader about what it means. `.rate-card` is the same
four-shadow recipe under its own name, with the white inset highlight turned
down (0.9 → 0.35 alpha) since these cards are already coloured rather than
white — a highlight tuned for a light surface read as a bright seam at the
top edge of a dark blue one at full strength.

### Diesel first, petrol second - a hardcoded array had it backwards

The rate cards were written as `['petrol', 'diesel'].map(...)`, which is
alphabetical and happens to be the opposite of `FUEL_ORDER` in
`fuel-colors.js` ("the pump's own layout... not alphabetical," used by the
Dashboard's tank cards and every other paired fuel list already). Swapped to
`FUEL_ORDER.filter((f) => f in rates).map(...)` so this reads the same
direction as the Tanks section directly beneath it, and cannot drift out of
step with the app's one canonical order again.

### The Tanks section gets the same treatment, and a genuine question about what it shows

**Capacity and opening stock are the tank's own version of "set once when
the pump goes onto the system, then almost never touched again"** - the exact
reasoning `NozzleSettingsButton`'s own comment already gives for the wiring
form. `TankForm` moved the same way: a read card in the Dashboard's own tank-
card language (accent border, coloured dot, level read as text before it is
read as a bar) with a small **✎ Edit** button opening a dialog that carries
the original form - capacity, opening stock, date, the live gauge that warns
before an opening stock is saved over capacity - now closing to a `<Toast>`
instead of leaving a permanent "Saved" state in a form that stood open
anyway. `FuelBadge` was dropped from the read card for the same "drop a badge
the band has made redundant" reason as the rate cards - the accent border and
the dot already say the fuel twice.

**"These should be after dip values or not?"** was asked while reviewing the
new card, and it is worth answering here because the instinct is a reasonable
one and the schema deliberately does the opposite. `current_stock_litres` is
the BOOK stock - opening stock plus purchases minus sales, recomputed
continuously by trigger (`002_functions_and_triggers.sql`) - and a dip never
writes back into it. Migration 039's own comment explains why: a dip is a
periodic reality check AGAINST the book, producing its own `gain_loss`
figure, not a correction that resets the book to match. If a dip silently
snapped the book to the measured value, small day-to-day discrepancies -
evaporation, calibration drift, a slow leak - would vanish every time someone
dipped the tank instead of accumulating into a trend the Stock page can show.
So the card showing the live book figure is correct for what it is for
("what does the book say right now"), and a new `getLastStockCheck(tankId)`
in `data-service.js` adds the other half as its own line underneath - "Last
dipped 24 Aug 2026 · −18.5 L", linking to Stock checks - so the book figure
and the last reality check against it sit on the same card without either one
pretending to be the other. One call per tank rather than `getStockChecks()`
filtered in JS: that list is deliberately uncapped for its own page (the Stock
page needs every row to answer "has this date been checked"), and pulling the
whole history just to find one tank's newest row would be the unbounded-list
trap this file has already been burned by once (see the comment on
`getStockChecks` itself).

Ordered by `books_date` - the trading day a dip CLOSES - not `check_date`,
the day the rod physically went in, for the same reason migration 039 exists:
a morning dip closes the PREVIOUS day, so sorting by the day it was taken
could hand back a dip that reads as "most recent" while actually closing an
earlier trading day than one taken the evening before.

### Two stale sentences, found while on the page anyway

Settings' own header still read "Prices, hardware and who can sign in." Staff
logins moved to `/admin/account` a while ago - that page's own comment says
so explicitly ("Staff logins used to live under Settings, which was the
wrong page for it") - and nothing on Settings has managed a login since. The
description now says "Prices, tanks and backups," which is what the page
actually contains. The matching comment in `helpers.js`'s `ROUTE_ACCESS`
table, still pointing the other way ("Managing other people's stays under
/admin/settings"), was corrected alongside it. Neither was a UI bug; both
were a doc drifting a page and a comment out of step with a move made in a
different commit, the kind of thing worth a `grep` before trusting a
description on screen.

**Verified** again after all of the above: the corner seam is gone at every
width checked, the two rate cards read left-to-right as diesel/petrol with
clear space between them and between the heading row and the cards, the Tanks
read cards show the right accent, gauge and last-dip line in all three states
(recent gain, recent loss, never dipped), and the edit dialog still pre-fills
and saves correctly.

## Total sold this month — and a first attempt that answered the wrong question

Every fuel total on the Dashboard was scoped to one day, because
`get_daily_summary()` was written for exactly one question - what happened
today - and every subquery in it filters by `p_date`. There was nowhere to
read "how many litres of petrol has this pump sold this month," which is the
kind of number an owner asks about out loud rather than reads off a screen,
and until now the honest answer required adding up daily figures by hand.

**First shipped as a LIFETIME total (migration 054) - "petrol and diesel sold
in litres till date" was read as "since the pump started using this app."**
That was the wrong reading. The very next message corrected it: "I meant total
sold in the running month, not all time." 054 was left alone rather than
edited - a migration that has run is never rewritten, the same reasoning
037/038 already set down in this file (037 added a feature, 038 removed it one
migration later, and 037 was not rewritten to pretend it never happened) - and
**055 replaces `lifetime_by_fuel_type` with `month_by_fuel_type`**, scoped to
the calendar month `p_date` falls in, from the 1st through `p_date` itself.
Not through the end of the month, and not through today regardless of which
day is on screen: every other window on this page ends on the day being
looked at rather than on today (the trend charts' own comment says so in as
many words), and a reader who has stepped back to the 10th should see the
month-to-the-10th, not the 10th plus days that have not happened yet from that
day's point of view.

**Folded into `get_daily_summary()` rather than a separate RPC**, both times.
The Dashboard already calls this function once per render for everything else
on the page, and the figure only depends on the date already being passed in
- so answering it here is one more subquery in an existing round trip, not a
second network call. Same join shape as the `by_fuel_type` key immediately
above it (`nozzle_readings` → `nozzles` → `tanks`, grouped by `fuel_type`),
with `date_trunc('month', p_date)::date <= reading_date <= p_date` in place of
`by_fuel_type`'s `reading_date = p_date`.

**Litres only, not sales, cash or credit.** The question this answers is "how
much fuel has moved through this pump this month," and a month's rupee figure
is already the "Total sales" tile's own job at the top of the page - repeating
it here in a different scope would be confusing rather than additive.

**Its own always-visible section, not folded into "By fuel type."** That
section already shows petrol and diesel for the day on screen, and reusing its
cards for a second, differently-scoped figure reads as one card answering two
questions. It also does not work on a day with nothing entered: "By fuel type"
collapses to an empty state precisely then (see the screenshot that prompted
this - Tuesday, 25 Aug 2026, "Nothing entered for this day yet"), and a
month-to-date total is exactly the figure that should still be there on a day
like that. So "Total sold in [Month Year]" is its own heading and its own row
of two cards, in the same `card border-t-4` language the app already uses for
a fuel pair (`By fuel type`, `Tank stock`) - same accent border, same coloured
dot, same bold heading. Reads from a `Map` built from the RPC's array rather
than the array directly, so a fuel that has not sold a single litre this month
still gets its card at 0 L instead of silently vanishing from a two-card row
that would look incomplete with only one.

**"By fuel type" itself named while this was being reviewed.** Its heading was
just "By fuel type," full stop, on a page that steps back through weeks of
history with the date arrows above - so once a second, differently-scoped fuel
section existed on the same page, the ambiguity became impossible to miss:
which day, or which window, is "by fuel type" even talking about? Fixed with
the same rule the tank cards already follow ("a figure that is a moment in
time must name its moment," docs/UI_CONVENTIONS.md) - a line reading "On
{formatDate(date)}" now sits under the heading, and the new section gets the
equivalent treatment ("Up to {formatDate(date)}" under "Total sold in
[Month]"). Neither addition changed what either section computes; both only
say out loud what was previously implicit.

**Verified by SQL and by re-reading the JSX, not by screenshot.** Both
migrations were applied to the live project and the underlying aggregate
queries run directly against it, returning real, sane totals (10,450.37 L
diesel, 39,477.53 L petrol for the month at the time of writing) before the
RPC's own `is_super_admin()` guard was confirmed separately to refuse an
unauthenticated call, exactly as every other reporting RPC in this file does.
The page itself was not rendered and screenshotted: Next.js 16 refuses a
second `next dev` against the same project directory while one is already
running, and the owner's own dev server was live and testing the Settings
work above throughout. The month-total cards are a close structural copy of
the "By fuel type" cards directly above them on the same page (identical
classes, same dot-plus-heading shape), which are proven in production - but
that is a lower bar than an actual screenshot, and is written down as such
rather than claimed as full verification.

**Correction, one entry later: the screenshot was possible after all.** The
lock only blocks a SECOND `next dev` *process* - it does not block requests to
the one already running. A disposable devcheck route dropped into the live
project gets picked up by the owner's own dev server's file watcher like any
other edit, and a script can then point Playwright at `localhost:3000`
directly, screenshot it, and delete the route again - no second server, and
nothing the owner's own session notices beyond a route that briefly existed.
Used for every visual check from the next entry onward, including the two
below.

## The Dashboard, grouped into zones instead of a flat list of sections

**The complaint, verbatim: "too much numbers on one page, not separated into
subsection or no layout design to make it read easier."** By the time the
month total above landed, the Dashboard had grown to five top-level
`.section-heading`s stacked in a column - By fuel type, Total sold this
month, Tank stock, Lubricants, Last N days - each the same size, each reading
as an unrelated topic, with nothing on the page saying that the first three
were all facts about the same thing (fuel).

**Regrouped into three zones - Fuel, Lubricants, Trends - each with its own
larger heading, and the three fuel subsections (By fuel type, the month
strip, Tank stock) sit under "Fuel" with smaller subsection labels instead of
three more `.section-heading`s.** Hierarchy comes from SIZE alone
(`text-xl` zone headings, `text-base` subsection labels, both bold and near-
black) - deliberately NOT from shrinking a heading down to the small
uppercase caption style `.figure-label` uses. `.section-heading`'s own
comment in `globals.css` already records why that specific mistake was tried
once and reverted: "IT MUST NOT LOOK LIKE `.figure-label`... a heading that is
typeset as a caption does not read as a heading," and the owner said so
himself about the Reports page at the time. A zone break also gets a hairline
`border-t border-ink-200` and extra top margin, so a reader scanning down the
page gets a visible pause between topics, not just a size change.

**The month-to-date strip nearly repeated that exact mistake in miniature.**
First version was `text-sm` (14px) throughout, in a flat-bordered box with no
shadow - and the very next message back was "too small to be visibly seen,"
followed by "father sees this daily," which is the answer to §0 of the
small-business-ledger-app skill this repo already commits to: an older reader
on a tablet, checking real figures. The type floor that skill sets - 16px
body, 18px figures - is not a suggestion that shrinks for a block that looks
minor in a mockup; it applies to every figure on the page equally, and this
one had quietly fallen under it because "slim strip" was read as "small text"
rather than "less width of information." Fixed to `text-base` labels and
`text-lg font-bold` litres, and given the same `.card` shadow every other
block on the page already has, so it reads as a card worth noticing rather
than a caption to skim past.

**Verified by screenshot this time** (see the correction above) - both the
full page at 1100px and 400px, and the month strip alone before and after the
type-size fix, via a devcheck route hitting the owner's own already-running
dev server.

**Left for the owner to approve or discard, on his own instruction: nothing
here reached `main` until he said "push."** Worth recording as the pattern
for a redesign of taste rather than a bugfix - build it, verify it renders
correctly, hand it back for a live look, and only treat it as done once the
person who has to read it every day says so.

## Tightened for a short screen

A photo of the Customers page on a friend's laptop, screen resolution set to
1600×900, showed the table with a gap between rows big enough that only two
rows and a sliver of a third fit before the card started scrolling - the
owner circled the gap with an arrow. His own laptop is taller, so this had
never shown up before.

The row height was `.td`/`.th`'s `py-3` (12px top and bottom), the same
padding the app uses for a button - but a table row is not a tap target, its
only click is the name link inside it, so it does not need the `py-3` floor
`docs/UI_CONVENTIONS.md` sets for buttons and tabs. Dropped to `py-2` on all
three cell classes (`.th`, `.td`, `.td-num`), which is a change to every
table in the app, not just Customers.

The rest of the page's vertical rhythm was tightened to match: `<PageHeader>`'s
bottom margin `mb-6` → `mb-4`, the `<main>` wrapper's `py-6 sm:py-8` →
`py-4 sm:py-6` in `app/admin/layout.js`, and the `mb-4` spacer above the
Customers stat row to match the new header margin. `PageHeader` and the admin
`<main>` are shared by every page under `/admin`, so this is also an
across-the-board change, not a Customers-only fix.

**Verified with a devcheck route** rendering the real sidebar and fifteen
fixture customers (names, phones, credit limits and balances shaped like the
photographed list) through the actual `.th`/`.td` markup, screenshotted at
1600×760 (1600×900 minus a realistic amount of browser chrome), 1024×768 and
400px wide. At 1600×760 seven rows are now visible instead of two; at 1024
and 400 nothing wraps or clips that did not already wrap or clip before -
the existing horizontal table-scroll at 1024 and the stacked stat tiles at
400 are unchanged.

**Then asked to go to the bare minimum at that size and smaller.** `py-2`
was still spending 8px of pure padding per row on a screen where every row
mattered. Added `@media (max-width: 1600px) { .th, .td, .td-num { py-1 } }`
right after the three cell classes in `globals.css` - one rule, not a
duplicate set of classes - so 1600px and narrower (the reported laptop and
everything smaller, phones included) drops to 4px top and bottom, and
anything wider keeps the `py-2` a bigger screen has room for. Text size and
line height are untouched; only the padding, which was the one part of the
row that was air rather than something a reader needs. Re-screenshotted the
same devcheck at 1600×760 (nine rows visible, up from seven), 1700×900 to
confirm the media query does NOT fire above the threshold and `py-2` still
holds, 1024×768 and 400px wide - no new wrapping or clipping at either
narrow end.

**Then an edit button on the same table**, so a misspelled name or a changed
phone number no longer needs a trip into the customer's own page first.
`EditCustomerButton` already existed - it is what "Edit details" opens on
`/admin/customers/[id]` - so this is one new prop rather than a second form:
`iconOnly` swaps its trigger for a pencil `IconButton`, the same row-action
pattern Remove already uses, instead of the labelled button that page has
room for and a table row does not. The dialog, the validation and the
`updateCustomer` action underneath stay the single copy.

The actions column used to be owner-only, rendered around `isOwner` in both
the header and the body - because Remove is. Editing is not: `updateCustomer`
accepts `data_entry` as well as `super_admin`, and the customer page already
showed "Edit details" to both roles. So the column header goes back to
rendering unconditionally, `EditCustomerButton` sits in it for every row
regardless of role, and only `RemoveCustomerButton` beside it stays gated on
`isOwner`.

One shape mismatch to note for next time: `get_customer_balances` (the RPC
this list is built from) names the primary key `customer_id`, but
`get_customer_statement` - what the detail page reads, and what
`EditCustomerButton` was written against - returns the raw `customers` row,
where it's `id`. The list passes the button a small reshaped object
(`{ id: customer.customer_id, name, vehicle_number, phone, credit_limit }`)
rather than the row as-is, or the hidden `customer_id` field in the edit form
would have posted `undefined`.

Verified with a devcheck route rendering the real `EditCustomerButton` and
`RemoveCustomerButton` in fixture rows: the two icons sit side by side at
1600px and 1024px width (1024 already scrolls the table sideways before this
change, for the same reason the Owes column does - unrelated), and clicking
the pencil on a row opens the dialog pre-filled with THAT row's name and
vehicle, not the first row's.

## A unit was damaged and replaced, and its meters start again at zero

The pump had been running normally for months when one of the dispensing units
was damaged and had to be taken out. A new diesel unit was fitted in its place,
with two nozzles whose meters start at 0.

**The instinct is to reset the meter, and the instinct is wrong twice over.**
Both ways of doing it fail, and the second fails loudly at the worst moment:

- Editing `starting_reading` under **Edit nozzle wiring** does nothing at all.
  That figure is only consulted until a nozzle has its FIRST saved reading
  (migration 012, and the comment there says so); on a nozzle that has been
  trading for months it is dead data. The owner would set it, see no change on
  any screen, and reasonably conclude the app was broken.
- Entering the next day opening at 0 is refused, correctly, by
  `nozzle_readings_closing_gte_opening` and by the chain rules in 026/027 — a
  meter does not run backwards. And if it were somehow allowed, `litres_sold`
  for that day would be about **minus two million litres** of diesel, which the
  tank trigger would then apply.

**A new unit is new nozzles.** The thing standing on the forecourt is not the
same object any more and neither are its meters, so the honest record is two new
`nozzles` rows starting at 0, and the old rows kept untouched — every reading,
every rupee of cash and credit and every litre drawn out of the diesel tank for
the whole life of the old unit hangs off them by foreign key. Nothing about the
past changes at all.

**Migration 056** is what that needs:

- **A service window on each nozzle** — `commissioned_on` and `retired_on`, both
  inclusive, plus `replaced_by` for the lineage. `is_active` cannot do this job
  and it is worth being clear about why: `is_active` is a fact about **today**,
  and the reading sheet asks about a **date**. Deactivating the old nozzles
  would hide them from 3 August as much as from today, so last month's readings
  could no longer be opened or corrected. A check constraint ties the two
  together (`retired_on is null or is_active = false`) so they cannot contradict
  each other.
- **The unit number freed up.** `unique (unit_number, nozzle_label)` from 001 was
  right while a nozzle was forever; it is wrong the moment a unit is replaced in
  place, because the new Unit 1 · Nozzle A collides with the old one. It is now
  a unique index over LIVE nozzles only. The owner is not going to start calling
  the pump Unit 4 because a database said so.
- **A trigger, not a courtesy.** A reading dated outside its nozzle's window is
  refused, naming the day the pump was fitted or carted away. Litres invented
  for a pump that was not standing there look like any other day's on every
  screen that adds them up.
- **`replace_unit()` does the whole swap in one statement**, for the same reason
  `set_nozzle_wiring()` exists (022): half a swap is worse than none, because
  nothing on any screen would say which half took. It refuses to retire a unit
  on a day it already has readings past — those would be stranded outside their
  own window, still in the books and still in the tank's stock, but on days the
  sheet would no longer open.
- **`set_nozzle_wiring()` now refuses a retired nozzle.** Its `tank_id` decides
  which tank months of past sales were drawn out of; pointing a retired diesel
  nozzle at the petrol tank would silently move those litres between tanks and
  make both tanks' gain/loss fiction. Safe while every nozzle was live, not now.

**Migration 057** puts the service window into the audit trail's one-line
summary, so the four lines a replacement writes say *when* — "Unit 1 · Nozzle A ·
replaced 12 Aug 2026" rather than four lines reading "Unit 1 · Nozzle A". As in
048, the whole of `trg_write_activity()` is reproduced to change one branch of
its `case`; a plpgsql body cannot be patched in place.

**Stock needed no correcting entry, and it is worth writing down why** so nobody
goes looking for one. Tank stock is driven by `litres_sold`, which is a
difference between two figures on the SAME reading — never between two nozzles
or two meters. A meter starting again from zero on a new nozzle draws the diesel
tank down exactly as the old one did. There is no gain/loss to explain.

**The changeover day may belong to both units.** A dispenser is not always
swapped overnight: the damaged one can sell in the morning and its replacement
in the afternoon, so both have a real reading dated that day. `retired_on` and
`commissioned_on` are inclusive and may be the same date, and on that one day
the reading sheet holds two Unit 1s. Left alone that is four cards captioned
"Unit 1" with nothing to tell them apart, on the evening when getting them the
wrong way round would put the old pump's last figures onto the new pump's
meters — so the Readings page now groups by unit number AND commissioning date
(not by unit number alone, which would draw them as one four-nozzle pump that
never existed) and each card carries *being replaced today* or *the new unit*.
Words, not colour: both are the diesel pump, so both are correctly the same
colour and colour has nothing left to say.

**Settings grew a Dispensing units section.** The nozzle wiring dialog answers
"how is the place plumbed", a standing fact; this answers "what is standing out
there now, and what used to be", which is a history. A card per live unit with
its nozzles, tank and meter starts and a **Replace this unit** button, then a
read-only table of replaced units with the day each stopped.

**The dialog's summary panel is the point of it.** This is done once every few
years by someone who will not do it again for a long time, and the two dates are
the part that is easy to get subtly wrong. So before anything is written the
form says back, in plain words, which days belong to which pump — including
whether the two overlap on the changeover day or leave the unit out of service
for a stretch in between, worked out and stated rather than left to be inferred
from two date boxes.

**Verified** against a local Postgres with all 57 migrations applied: three days
of readings on Unit 1, then a replacement, then the reading sheet checked on the
day before (old unit only, still editable), the changeover day (both) and the
day after (new unit only, opening at 0). Every guard rail was made to fire — a
reading dated past retirement, one dated before commissioning, a replacement
with readings already past the chosen last day, rewiring a retired nozzle, and
two live nozzles claiming the same unit and label. The backup round trip was run
end to end: export, restore into a freshly migrated database, nozzles identical
including the new columns — and a *pre-056* file (the three keys absent) restores
correctly too, since `jsonb_populate_recordset` leaves a missing key null and
null is exactly "here from the beginning and still is".

**Screenshotted** at 1440, 1024 and 400px with a disposable devcheck route. One
real regression came out of it and was fixed: at phone width "meter started at
1,487,293.55 L" broke after the number and left `L` alone on the next line —
the fourth time this file has recorded that, and `whitespace-nowrap` on the
figure is the fix every time. See "A figure and its unit must not be able to
break apart" in `docs/UI_CONVENTIONS.md`.

## The pumps were also moved around, which is a rename and not a replacement

The replacement in 056/057 turned out to be half the story. What actually
happened on the forecourt on 1 September 2026 was:

- the diesel unit at position 1 was damaged and taken out;
- the petrol unit that stood at position 2 was moved into position 1;
- the new diesel unit was installed at position 2.

Only the first of those is a hardware event. The petrol dispenser is the same
object with the same meters, still counting up from 48,760.78 — it is simply
called something else now. That is a **label**, and until this change the labels
were the one part of the forecourt the owner could not touch without a
migration.

**So `unit_number` and `nozzle_label` became editable in Edit nozzle wiring**,
which is where they belong: they are how he refers to a pump when he is standing
in front of it, and if the app disagrees with the sticker on the machine, the app
is wrong.

**A rename applies to the whole history**, and the dialog says so in as many
words. A pump renumbered here shows under its new number on days already
entered. That is right for a rearrangement — the owner's own map has moved with
the hardware and he will never again think of that pump as Unit 2 — and wrong
for a pump genuinely swapped out, which is what Replace this unit is for. The
two are used together: rename first so the position you want is free, then
replace.

**Migration 058 is mostly about one constraint**, and it is the interesting
part:

- **A straight swap has to be legal.** Renumbering 2 → 1 and 1 → 2 is the normal
  case, and it passes through a moment where two nozzles both claim position 1.
  A plain unique index checks per row as the UPDATE walks the table, so it
  refuses the swap halfway through and *no ordering of the rows avoids it*. The
  constraint therefore has to be **deferrable** — checked once, at the end, when
  the forecourt is whole again. Same reasoning as 044's treasury guard.
- **A position is only occupied for the days it is occupied.** 056's
  `nozzles_live_unit_label_idx` said "one LIVE nozzle per unit and label", which
  was enough when the only event was a replacement. It is not enough now: the
  retired diesel pump still holds position 1 for every day up to 31 August, and
  the petrol pump moving in must not claim those same days as well. Two pumps at
  one position on one date is exactly the state that makes a day's sheet
  unreadable.

  So the rule became an **exclusion constraint** over the service window 056
  already gave every nozzle — `exclude using gist (unit_number with =,
  nozzle_label with =, daterange(commissioned_on, retired_on, '[]') with &&)`,
  which needs `btree_gist` for the two equality columns. It is strictly stronger
  than the index it replaces, and it is what makes the two halves of the
  rearrangement safe to type **in either order**: retiring the diesel pump on 31
  Aug and giving the petrol pump position 1 from 1 Sep do not overlap.

`set_nozzle_wiring()` forces the deferred check with `set constraints …
immediate` inside an exception block before it returns, so a clash comes back as
a sentence about two pumps at one position rather than as a raw 23P01 at COMMIT,
from underneath the Server Action, carrying the row numbers of a GiST index.

**Replaced nozzles are listed in the dialog now**, with only their caption
editable. Leaving them out would have made the swap impossible — you cannot move
a pump into position 1 while something else still occupies it and is not on the
list to be moved out of it. Their tank and starting meter stay read-only for
056's reason, and are *shown* rather than hidden: the owner is renumbering that
row and "Diesel Tank, 1,985,669.36 L" is how he knows which pump it is.

**Two bugs found by rendering it, both real:**

- **A hidden `<input>` was a direct child of `<tr>`.** Invalid HTML, and the
  browser does not merely warn — it *hoists the element out of the table* on
  parse, which silently reorders the very sequence the index alignment depends
  on. Caught as a hydration error in the dev log, which is worth saying because
  the screenshot looked perfect. The field went back inside the first `<td>`.
- **A field that some rows opt out of cannot use the repeated-name-and-index
  trick.** `tank_id` and `starting_reading` are omitted for replaced rows, so
  their lists arrive shorter than `nozzle_id`'s and every row after the first
  replaced one lines up against the wrong nozzle. They now carry the id in the
  field name (`tank_id__<uuid>`) and are looked up per row. The repeated-name
  scheme is still right for the three fields every row has.

**`formatLitres` and `formatNumber` moved from `helpers.js` to
`format-helpers.js`.** The dialog needed to show a replaced pump's starting
meter, and it is a client component; `helpers.js` reads request cookies for the
role checks, so importing it into the browser bundle fails the build outright.
`helpers.js` re-exports both, so every existing caller is unchanged — this is
the same move `formatRate` and `saleAmount` already made, for the same reason.

**No duplicate-position check was added to the Server Action**, deliberately, and
the code says why: two nozzles may share a unit number and label perfectly
legitimately as long as they were not on the forecourt at the same time — the
diesel pump replaced on 31 Aug and the one fitted on 1 Sep are both "Unit 2 ·
Nozzle A" and both correct. Deciding that needs each nozzle's service window,
which the action does not have. A cheaper check there would have been a check
that was *wrong*, and it would have refused the one arrangement this whole
feature exists to record.

**Verified** against a local Postgres with all 58 migrations applied, seeded with
the pump's real layout and its real 31 August closings (Unit 1 diesel at
1,992,508.41 / 1,919,421.09; Unit 2 petrol at 48,760.78 / 24,835.72). The whole
sequence was run: swap the two units in one save, then replace the diesel one.
31 August still reads exactly as before; 1 September shows the petrol pump
carrying on from 48,760.78 under its new number and the new diesel pump opening
at 0. Every guard rail was made to fire — a live pump sent to a position a
retired one still holds for August, a blanked label, a zero unit number, and a
retired nozzle's tank. Renumbering a *retired* pair to Unit 4 and back was
confirmed to work, since that is what frees a position.

**Screenshotted** at 1440, 1024 and 400px, and the form's own serialisation was
dumped through `FormData` to confirm the index alignment survives the two
opted-out fields.

## Profit was charging each month-end's stock loss to the following month

Found on 1 September 2026, by the owner, from the outside: September had
nothing in it at all — no readings, no deliveries, no dips, no expenses — and
the Reports page showed a **loss of Rs 9,585**. Its own working, printed under
the tile, gave the shape of it away:

> Rs 614,973 in the tanks at the start, plus Rs 0 bought, less Rs 605,389 still
> there at the end — Rs 9,585

Nothing had moved, so those cannot be two different stock levels. They are the
**two sides of the 31 August dip**:

| | books said | dip measured | |
|---|---|---|---|
| Diesel | 981.85 L | 971.00 L | −10.85 L |
| Petrol | 759.67 L | 743.00 L | −16.67 L |

27.52 litres really did go missing and the 31 August dip really did find them.
Rs 9,585 is the right amount of money. It was in the wrong month.

**Two different questions were being answered by one function.**

`calculate_expected_stock(tank, d)` answers *"what do the books say should be in
this tank at the close of d"*. It takes the last dip closing a day **strictly
before** `d` and rolls purchases and sales forward — and that strictness is
deliberate and correct where it lives (039): a dip closing `d` is the thing that
figure is about to be **compared with**, so letting it be its own baseline would
make expected equal actual and every gain/loss nought.

`stock_value_at(d)` was reusing it, through `tank_stock_value()`, to answer a
different question: *"what is the stock in this tank worth at the close of d"*.
That wants the best available knowledge of what is physically in the tank — and
when somebody dipped it that morning, **the dip is the best available
knowledge**. Inheriting the exclusion made the valuation deliberately ignore its
own most accurate measurement.

The result is a one-day slip at every month boundary:

- August closes on the **book** figure — the 31 Aug dip is excluded, being 31 Aug
- September opens on that same figure, so the join looks continuous and nothing
  appears wrong
- September closes on the **measured** figure, because by 30 Sep that dip is
  safely in the past

and the shortfall falls through the crack between the two. This pump dips every
day, so **every** month-end had it. In a trading month it is buried inside a
six-figure cost of goods and roughly cancels against the month before, which is
why it survived since 049. In a month with no trading it is the entire report.

It had also been quietly contradicting the Stock page, which has shown 971 L and
743 L since 31 August: `recalc_tank_stock` asks about *today*, no dip closes
today, so nothing was excluded and it got the measured answer. The books
disagreed with themselves depending on which screen asked.

**The fix is a second function for the second question**, not a flag on the
first. `tank_stock_on_hand(tank, d)` is `calculate_expected_stock` with
`books_date <= p_date` instead of `<`; when a dip closes the day, that dip is the
answer and the roll-forward adds nothing. `calculate_expected_stock` is
untouched, so the Stock Checks page, the gain/loss figures, the daily summary,
the stock register and `recalc_tank_stock` all keep asking the book question and
all keep getting exactly the answers they got before.

**The closing-litres table had to move with it.** The Reports page prints the
working in a sentence (from `stock_value_at`) and then a per-tank closing-litres
table underneath (from `calculate_expected_stock`). Fixing only the sentence
would have left the page showing 981.85 L in a tank it had just valued at 971 L
— so `get_monthly_report` and `get_month_export` had their `closing_litres`
expression patched to `tank_stock_on_hand` as well. Patched rather than
reproduced, using the technique 049 established on these same two functions and
for the same reason: thousands of characters of report nobody re-reads, and
hand-copying to change one expression is a chance to silently drop a line. It
raises if the expression has moved, and re-running the migration proves that —
it refuses the second time.

**What actually changed, stated precisely, because it is a reported profit:**

- **August 2026 profit drops by Rs 9,585** — the loss is charged to the month the
  fuel went missing. The 31 July dip came out exactly level (0.00 on both tanks)
  so August's opening figure does not move at all, and this is the whole of it.
- **September 2026 profit becomes Rs 0**, which is what an empty month says.
- Every earlier month shifts by the difference between its own month-end dip and
  the one before it. That is the correction, not a side effect.
- **No stored row changes.** Every one of these figures is derived on read.

**Verified twice.** First against a local Postgres seeded to reproduce it — 1,000
L bought in August, a dip finding 880, August charged Rs 0 and September charged
Rs 30,000 before the fix; Rs 30,000 and Rs 0 after, with
`calculate_expected_stock` still returning 1,000.00 and the dip's own gain/loss
still −120.00. Then on the live project after applying: September's cost of stock
sold is 0.00, stock value at 31 Aug and 30 Sep are both Rs 605,388.60, the 31 Aug
dips still flag their −27.52 L, lifetime gain/loss is unchanged at 2,011.50, all
186 readings are untouched, and the Stock page's 971/743 now agrees with the
valuation instead of contradicting it.

## The tank a nozzle draws from is not a caption (migrations 060, 061)

**What happened, and it is worth reading before touching `nozzles` again.** The
forecourt was rearranged on 1 September 2026. The diesel pump at position 1 was
damaged and scrapped; the petrol pump at position 2 was moved into position 1
and re-piped onto **diesel**; a new pump was set down at position 2 on
**petrol**; Unit 3 was untouched. Three events, and the owner recorded the first
two exactly right — a rename (058) for the move, "Replace this unit" (056) for
the scrapped pump, both on the correct dates.

The third he recorded on 2 September by opening **Edit nozzle wiring** and
changing the moved pump's tank from Petrol to Diesel. Forwards that is true.
Backwards it is not, and `nozzles.tank_id` has no date on it — so it applied
backwards too:

|                | as the books read | as it actually happened |
| -------------- | ----------------- | ----------------------- |
| August diesel  | 32,213.62 L       | 12,920.36 L             |
| August petrol  | 30,605.16 L       | 49,898.42 L             |

19,293.26 litres of August petrol became diesel in one dropdown. Every figure
that asks *which tank did this litre come out of* — stock, gain/loss, litres by
fuel, the profit split, the month export — answers it by joining
`nozzle_readings` to `nozzles` and reading `tank_id` **as it stands now**.

**The money was never wrong.** `rate_per_litre` and `sale_amount` are stored on
each reading, so cash, credit, customer balances, the treasury and total revenue
were all intact throughout. So was the *current* stock figure: both tanks were
dipped on 1 September, and `calculate_expected_stock` measures from the latest
dip, so nothing before it reaches today's number. What moved was August.

**060 closes the door.** `set_nozzle_wiring()` now refuses to change `tank_id`
on a nozzle that has any reading against it, and the message names the dialog
that does the job properly. 056 had already frozen `tank_id` on a *retired*
nozzle and had written down exactly this reason — "its tank_id decides which
tank every one of its past sales was drawn out of". The argument was always
about the readings, never about the retirement; retirement was just the only
case anyone had hit. The rule is now the one 012 already applies to
`starting_reading`: **settable until the nozzle's first saved reading, history
after it.** A nozzle with no readings can still be re-pointed freely, which is
how a freshly fitted pump gets corrected — and is why the other half of the
owner's 2 September change (the new Unit 2 pair, which had never traded) was
harmless.

**061 puts August back**, and does it by saying what actually happened rather
than by undoing a field. The pump is recorded the way the books already know how
to record a pump whose fuel changed on a day: Unit 1 · A and B go back onto the
petrol tank and are **retired 31 Aug**; two new Unit 1 nozzles are **fitted 1
Sep** on the diesel tank, with `starting_reading` set to each meter's 31 August
closing — 48,760.78 and 24,835.72, not 0, because the meter did not go back to
zero, only the fuel behind it changed. `replaced_by` links them. That is
`replace_unit()` in every respect except that the hardware did not change, which
the books do not care about: a nozzle row *is* "a meter, drawing from a tank,
over a span of days".

**Why not date `tank_id` instead.** Because a dated nozzle already exists —
`commissioned_on`/`retired_on` — and a second, parallel notion of "this row's
tank, but only for these days" would have to be learned by every one of the
dozen places that join a reading to a tank, each of them a money figure. A new
nozzle row costs one insert and every existing query is already correct against
it.

**Verified against the live schema in a rolled-back transaction**, since the
scenario only exists there: after the repair August reads 49,898.42 L petrol and
12,920.36 L diesel (the "as it happened" column above), `set constraints all
immediate` accepts the forecourt so `nozzles_one_pump_per_position` is satisfied
on both sides of 31 August, `recalc_tank_stock` leaves the tanks at 971 and
5,743 exactly as before, and the 060 guard blocks a traded nozzle while still
allowing an untraded one. Nothing was written; the migration is the thing to
run.

**The dialog shows the rule rather than teaching it by error.** The tank cell is
read-only on any nozzle that has traded, captioned *"set — this nozzle has days
entered"*, and the notice above the table gained a second paragraph folded into
the existing renaming one — not a third box, because three notices is a wall the
owner scrolls past, and this is the one he most needs to have read. The starting
meter stays editable on a live nozzle: unlike the tank it is dead data after the
first day (012), so freezing it would buy nothing and take away the field the
amber warning tells him to use. `getNozzles()` carries an embedded
`nozzle_readings(count)` to answer "has it traded" in one round trip.

**One thing for the owner, not a bug.** The new Unit 2's meters were set to
41.04 and 44.26 rather than 0 — litres that left the petrol tank during
commissioning and will never be a sale. If they were drawn *after* the 1
September dip, they will surface as a petrol stock loss at the next dip. That is
correct bookkeeping; it is only surprising if you have forgotten why.

### August keeps the numbers August had (migration 062)

A follow-on, and only possible because of 061. `unit_number` is one field per
nozzle row, so the 1 September renumbering had taken each pump's whole August
with it — leaving August captioned as the mirror image of the forecourt that
actually stood there: Unit 1 reading petrol (the pump that later moved) and
Unit 2 reading diesel (the pump that was scrapped).

061 had split the moved pump into two rows, petrol to 31 Aug and diesel from 1
Sep, because its *fuel* changed on a date. Its *position* changed on the same
date — so once there were two rows there was somewhere to put the two answers,
and the fix is a relabel of rows that already carry the right dates. The
scrapped pump goes back to Unit 1, where it stood every day it dispensed; the
moved pump's August rows go back to Unit 2, where it stood every day those
readings were taken. September is untouched.

**August now reads as it was:** Unit 1 diesel 12,920.36 L, Unit 2 petrol
19,293.26 L, Unit 3 petrol 30,605.16 L. **September onward reads as it is:**
Unit 1 diesel from 48,760.78, Unit 2 petrol from 41.04, Unit 3 unchanged. No
reading, rupee or litre moved — `unit_number` is a caption, and which tank a
sale came out of is `tank_id`, which 061 had already put right.

**One statement, because it is a swap.** The relabel passes through a moment
where two rows claim Unit 1, so it lives in a single DO block and lets
`nozzles_one_pump_per_position` (deferred, 058) check once at the end. This is
the same reason 058 made that constraint deferrable in the first place.

**The scrapped pump's `replaced_by` had to move too.** It pointed at the new
*petrol* pump — true only in the sense that both wore the number 2 for a day,
because "Replace this unit" was run on Unit 2 at a moment when the renumbering
had already happened. It now points at the pump standing at Unit 1 on diesel,
which is what took over its position and its fuel. That leaves the September
diesel row with two predecessors and both are true: same machine as the August
Unit 2 petrol row (it moved), successor at position 1 to the August Unit 1
diesel row (it took over). `replaced_by` is a record read by nothing in the
app, so the fan-in costs nothing and naming only one of the two would be the
lie.

## Correcting a ledger entry, and giving the ledger the page (migration 063)

Two things the owner asked for on the customer page: put the payment form in a
dialog so the table gets the full width, and give him a way to fix an entry he
typed wrong.

### The table gets the page

The payment form and the manual adjustment sat in a 22rem column down the right,
which cost the ledger a fifth of its width every second of every day so that a
form used once a visit could be permanently on screen. The table is what the
page is *for* — the owner reads down it checking entries against a paper khata —
and it was the thing being squeezed.

Both are now dialogs opened from the page header, which is the app's settled
answer everywhere else (a purchase, a customer, a nozzle replacement) and leaves
this page the last one that was still holding a form open beside its own data.
The balance card and the fuel tiles moved to a two-up row across the top, so
they are read once on arrival and then the eye goes to the table and stays
there. The adjustment form was already behind a toggle, which is the same idea
one step short: a panel that expands in place still reserves its width.

### "Edit" in a ledger that cannot be edited

`ledger_entries` refuses UPDATE and DELETE at the database (002) and RLS grants
only select and insert (003). That is the point of the table — a balance nobody
can quietly reach back and change is why it is worth more than a notebook — so
the button cannot edit, and calling it Edit would be the worse lie: the owner
would expect the old row to vanish, find it still there with two more beneath
it, and trust the screen less than before.

So it is **Correct this entry**, and it posts two rows through
`correct_ledger_entry()`:

- a **reversal** — same amount, same date, opposite direction — which cancels
  the wrong row *where it stands*, so every balance from that date onward is
  right again rather than only the balance today;
- and, unless the entry should never have existed, a **replacement** carrying
  what it should have said.

Both in one statement. Half a correction is worse than none: a reversal without
its replacement silently wipes a real payment, a replacement without its
reversal doubles it, and neither is visible on any screen afterwards.

**`corrects_entry_id` is what makes the result readable.** Without it the ledger
grows three rows of the same amount and nothing says which cancels which — a
worse account than before the button existed. With it the cancelled row is
struck through and badged *cancelled*, the reversal is badged *correction*, and
the pair reads as one crossed-out line the way it would in a register. A unique
partial index enforces one cancellation per entry, so the guard holds however
the row is written.

**Both rows keep their place in the running balance.** Skipping them would look
tidier and be wrong: the balance column says what was owed after each entry, and
between the mistake and its correction that really was the figure.

**What cannot be corrected here**, refused by the function and not offered by
the table: a row posted automatically from a nozzle reading or a lubricant sale
(the mistake is in the *sale*, and cancelling only its ledger side would leave
the two disagreeing about the same money forever), a reversal itself, and a row
already cancelled. Owner-only, matching `recordLedgerAdjustment` — recording a
payment is a data-entry job, deciding that something already in the books was
wrong is not.

**The balance preview is the point of the dialog**, exactly as it is in the
manual adjustment next door. Correcting Rs 15,000 to Rs 1,500 and correcting it
to Rs 150,000 look identical while you are typing; *Rs 67,138 → Rs 80,638* does
not. Somebody who fat-fingers a zero sees the wrong answer before committing to
it, which no amount of careful labelling achieves.

**`correctedIds` is a second query, not a join.** `corrects_entry_id` points
forward — it is set on the reversal naming the row it cancels — so "was this row
cancelled" is a backwards lookup, and the reversal is very often on a different
page from the row it cancels: a mistake from August gets corrected in September,
and September is page 1. Deriving it from the page's own rows would show the
same entry struck through on one page and live on another.

Rendered at 1152px, 1024px and 400px with a realistic ledger — an auto row, a
lubricant row, a manual adjustment, and a corrected payment showing all three of
its rows. The lubricant row also gained the `auto` badge it had never had, which
had left it the one row on the page with no pencil and no reason given.

**Still open, and the owner's call, not a bug:** the columns are headed *Fuel
taken* and *Paid*, which have never been true of a manual adjustment and are now
also not true of a correction — both are debits that are not fuel. Renaming them
to something like *Owed* / *Paid* would fix it and would change a heading the
owner reads every day, so it is left alone until he asks.

### Unit 1's diesel meters were set forward 157 L on 2 September (data, not code)

Not a migration and nothing in the schema — recorded here because the figures
look wrong on their own and a future session would otherwise try to "fix" them.

When the ex-petrol pump was re-piped onto diesel it had closed 31 August on
48,760.78 (A) and 24,835.72 (B). The owner read the meters again on 2 September
and they stood at **48,872.79** and **24,880.70** — 112.01 L and 44.98 L further
on, **156.99 L** between them. Those are now the two nozzles'
`starting_reading`, so the first September day opens on the real meters.

**This was settable at all only because the nozzles had no readings yet.**
`starting_reading` is consulted until a nozzle's first saved day and is dead
data afterwards (012), and 061 had created these two rows on 1 September with
nothing entered against them. Once September is entered, the same change would
have to be a correction to the reading, not a change to this field.

**Why it does not touch profit, and what would have.** The pump was run with its
lines empty while it was being shifted, so the meter counted air: it advanced
157 L without a litre leaving the tank. That is the whole explanation, and it is
the reason this is a meter change and not a stock movement. The readings start
from the new figures, those litres are never counted as sold, and the books and
the tank still agree — diesel expects 971 L and the 1 September dip measured
971 L.

It is worth keeping the phrase, because it will happen again the next time a
pump is moved: **a dispenser run dry still counts.** The meter is a mechanical
totaliser on the outlet, not a measurement of fuel, so any dry running during a
shift shows up as litres the books must be told not to charge anyone for. The
fix each time is this one — set the new nozzle's `starting_reading` to what the
meter actually reads before the first day is entered.

Had the fuel actually been drawn out — flushing the lines, calibration — it
could NOT have been kept out of profit, and that is worth writing down because
it will be asked again whenever a meter and a tank disagree. Profit is
`sales − (opening + purchases − closing) − expenses`, and since 059 closing
stock is valued at what the tank physically HOLDS. Fuel that leaves without a
sale therefore lowers closing stock and lowers profit by its cost — about
157 × Rs 365.60 ≈ **Rs 57,400** here — whatever is entered anywhere. Nobody paid
for it, so it cannot be free; the only choice available is whether it shows as
unexplained shrinkage at the next dip or as a named commissioning draw. There is
no third answer, and offering one would have been a lie in the owner's own
books.

**What to watch:** the reading above is that no fuel moved, so a coming diesel
dip should come out clean. If one instead lands roughly 157 L short, some of it
did leave after all and this entry is the place to start.

### The starting meter goes grey once a day is entered

A follow-on to the entry above, prompted by the owner asking a question the app
answered wrongly: *if my accountant verifies the difference was smaller, can I
just change the value in nozzle wiring?*

He can — **until that nozzle's first day is entered**. After that the field is
consulted by nothing (012): the day's opening is stored on the reading row, and
every later day chains off the previous day's closing. The edit still saves,
still reports success, and changes nothing anywhere.

That field had been left editable on a traded nozzle on purpose, on the grounds
that a dead field can do no harm. The question showed the reasoning was
backwards — it does no good either, in a box that looks exactly as live as the
one beside it, and the owner would have gone away believing a figure had moved.
So it now shows the litres read-only, captioned *fixed — the first day holds
it*, matching the tank cell two columns across (060) but for the opposite
reason: the tank is frozen because changing it rewrites the past, this because
changing it does nothing at all.

**The route that does work is named in the notice**, since there is one: delete
the day on the Readings screen, correct the meter here, enter the day again.

No migration. 060 froze the tank in the database as well because changing it was
actively harmful; changing a dead starting reading is merely useless, so the
guard belongs in the screen that would otherwise mislead someone and nowhere
else.

Rendered at 1152px and 400px with a mix of rows — retired, live-with-no-days,
live-with-days — confirming exactly two meter boxes stay editable and that the
caption no longer clips at the edge of the dialog's scroller (`whitespace-normal`
on the caption, since the cell is `whitespace-nowrap` to keep the litres figure
from breaking mid-number).

### The wiring dialog could not be saved at all (a regression, and how)

The owner reported *"Every nozzle needs a tank"* whenever he tried to change a
starting reading — a message about a field he could not see, naming rows he had
not touched. Deleting the reading he was experimenting with did not help,
because the row actually tripping it was Unit 3, which he had never opened.

**The cause was the 060 UI change.** `setNozzleWiring` looked up the two frozen
fields by nozzle id (`tank_id__<id>`, `starting_reading__<id>`) and validated
them **as a pair**: if either arrived, both had to. That held while every row was
either fully frozen (retired: posts neither) or fully live (posts both).

060 froze the TANK on any nozzle that had traded and left its meter editable. A
plain Unit 3 row then started posting a starting reading with no tank beside it,
the pair check failed, and **every save in the dialog was refused** — including
saves that had nothing to do with a tank.

**The fix is to check them separately**, which is what the RPC underneath has
always meant: `set_nozzle_wiring` coalesces a missing key to "leave this alone"
per field, so a row carrying one of the two is a perfectly good instruction.
There was never a reason to couple them in the action.

The later meter freeze (previous entry) also happens to restore the matched pair
by accident, so the dialog would have started working again anyway. That is not
the fix and was not relied on: a UI that freezes one field and not the other is a
reasonable thing to want, and it must not be able to take the whole dialog down.

**Verified two ways.** The half-row was replayed against the live schema in a
rolled-back transaction — a payload carrying only `starting_reading` for Unit 3 ·
A moved the meter to 12,345.67 and left the tank on petrol, untouched. And the
dialog's real `FormData` was dumped from the browser for one row of each kind:
retired posts its caption only, a freshly fitted nozzle posts both fields, a
traded nozzle posts its caption only.

**The lesson for this action, written into it:** a form where some rows opt out
of some fields cannot validate those fields as a group. Index alignment was
already abandoned for exactly this reason (022); the pair check was the same
assumption surviving one level further in.

### Docs: the damaged-unit procedure, written as a procedure

Everything about the 1-2 September forecourt work had been recorded as *history*
— what happened, in order, with the reasoning. None of it was written as
**instructions for the next time**, and the owner pointed out that there will be
a next time: pumps get hit, wear out and get shuffled at every filling station.

So `README.md` gains **"When a dispensing unit is damaged, moved or re-piped"**,
which is the whole job as a task rather than a story:

- a table of the three things that actually happen (same pump moved, pump
  replaced, pump re-piped onto another fuel) and which of the three controls
  each one needs — with the third spelled out, because *a pump that changed fuel
  is a replacement even though no hardware changed* is the one nobody guesses;
- the order for a combined swap-and-replace: **rename first, then replace, then
  check the meters** — and why a straight swap is safe in one save;
- **read the meter off the machine**, with the dry-running trap and the
  left-at-zero trap stated as the two ways it goes wrong;
- the deadline (a starting reading is only consulted until that nozzle's first
  saved day, per nozzle) and the way back once it has passed;
- what the database will simply refuse, so none of it can go wrong quietly;
- and the one genuinely unanswerable question, answered: fuel drawn during the
  changeover cannot be kept out of profit, litres the meter counted without
  dispensing cost nothing, and they are the same number with opposite meanings.

Also updated: `README.md`'s "What the database will not let you do" gains the
tank freeze (060) and `correct_ledger_entry()` (063); the migration table gains
060–063; `CLAUDE.md` gains two ground rules — forecourt equipment is dated and
its wiring is not a caption, and a meter counts turns rather than litres — both
pointing at the README section rather than restating it.

The skill's `references/database-rules.md` gets the general version, since it is
not about petrol: **equipment that carries a meter is dated, and its wiring is
not a caption.** An undated pointer rewrites history when it moves; the device
already has a lifespan and changing what it is connected to ends one span and
begins another; a new row costs one insert where a second time dimension costs a
rewrite of every query that touches money. Plus the totaliser rule, and the
no-op-control rule that came out of the owner's own question.

**And the payment button is green.** It went into the page header at the default
outlined style when it left the side column, so four grey buttons sat in a row
and the action the page exists for read like *Back to customers*.

## Sized for the 1600x900 laptop it is read on

The owner's father uses this app on a 1600x900 laptop and asked for it to be
optimised for that screen, and separately whether the sidebar should become a
burger there.

**What was measured first.** At 1600x900 the browser leaves about 780px of
viewport. The sidebar takes 240px, so 1360px is available for content — and the
content column was capped at `max-w-6xl`, 1152px. **104px of empty page down
each side**, while the widest tables (the Sale & Stock Register, daily sales,
the month export) scrolled sideways inside themselves to fit.

**The cap is now `max-w-[85rem]` (1360px)** — exactly what that screen has, and
deliberately no more: a bigger monitor gains nothing from a longer line of
prose. `ReadingsCashUpBar` carries the same number, because it is fixed to the
bottom of the window and any disagreement shows as the bar's edges not lining up
with the table it is summing.

**Prose got a measure instead.** At 1328px of text an ordinary explanatory note
ran to 107 characters a line, well past the ~75 that reads comfortably. The four
multi-sentence page-level notes now carry `max-w-[70ch]` (measured back to 71).
The one-line statements of a figure were deliberately left full width — they are
glanced at, not read, and look wrong boxed narrow.

**The burger question, answered with a measurement rather than an opinion:**

| | content width | rows visible |
| --- | --- | --- |
| as it was | 1152px | 16 |
| sidebar hidden behind a burger | 1152px | 16 |
| sidebar kept, cap widened | 1360px | 16 |

Hiding the sidebar changed nothing, because the container cap — not the sidebar
— was what held the content at 1152px. And rows visible never moved in any of
the three: **a sidebar costs width, and a short screen is short of height.** It
would have cost a click on every navigation and bought nothing. (Below 1024px it
already collapses to a burger, which is where that trade does turn.)

**Nothing else needed touching.** `StatGrid` and the Readings unit cards are
container-queried rather than viewport-queried, so they took the new width by
themselves — and were already at their widest layout at 1152, which is why the
gain lands on tables where it is wanted.

**Two comments were corrected rather than left stale.** `TreasuryEntryForm` and
the Treasury page both record the measurement that sent the entry form behind a
dialog: 736px of table needed, 504px available beside a 22rem form column at the
1152px cap. At 1360 the split would clear it (952px). The dialog stays — the
page still has to work below 1360, where the original measurement is unchanged,
and the answer should not depend on how wide the window happens to be — but the
arithmetic in the comment now says which cap it was measured against.

**Verified** at 1600x780 (the real viewport of a 1600x900 laptop), 1152x700 and
400x860: no page-level sideways scroll at any of them, the phone layout
unchanged. The check was run against a representative table page with realistic
data rather than against all twenty routes; the change is a single layout-level
cap plus four paragraph caps, and the container-queried components were reasoned
about rather than each rendered.

### The one-fuel customer's summary card

Reported straight after the width change, and a real bug the wider page merely
exposed: *Fuel taken in total* rendered one tile in the left half of a
two-column grid and nothing in the right, for the majority of customers who have
only ever bought one fuel. The owner's own reading of it — *"is it waiting for
diesel entry too?"* — is exactly the problem: an empty half looks like a pending
figure, not like an absent one. It is not waiting; `fuel_taken` only ever holds
fuels actually taken (checked against the live data for the customer in the
screenshot: four petrol slips, no diesel ever).

Three changes, all on `/admin/customers/[id]`:

- **The column count follows the data** — `sm:grid-cols-2` only when there is
  more than one fuel. `sm:grid-cols-2` was unconditional.
- **The band is horizontal**, badge one side and figures the other, so a
  full-width tile reads as one line rather than a label with two numbers under
  it and empty paper to their right. It still reads correctly in the narrow case
  where two bands sit side by side.
- **`items-start` on the summary row**, so the card is only as tall as what is
  in it. The grid had been stretching it to match the taller balance card,
  leaving a hand's width of blank card under a single band.

Rendered at 1600x900 and 400x900 with both cases — one fuel and two — side by
side on one page, so the comparison was looked at rather than reasoned about.

This is the second thing the 1152 → 1360 widening turned up (the first being
prose measure), which is the entry's real lesson: **anything laid out as a
fraction of the page wants re-checking after a width change, especially where
the number of items varies.**

### Checked Stock and the Dashboard for the same fault — they do not have it

Asked to check the other two pages with variable-count grids after the customer
card was fixed. Worth recording the negative result, because the obvious next
move is to "fix" them the same way and it would make both worse.

**What was surveyed.** Every `grid-cols-*` on `/admin` and `/admin/stock-checks`
that sits over a `.map()`:

| Where | Over | Verdict |
| --- | --- | --- |
| Dashboard, *By fuel type* | `by_fuel_type` — only fuels with readings that day | **Varies**, but fine — see below |
| Dashboard, *Tank stock* | `tanks` | Fixed at 2 |
| Stock, tank cards | `tanks` | Fixed at 2 |
| Dashboard, lubricant panels | two hard-coded sections | Not a map |
| Dashboard, month-so-far strip | a flex row, not a grid | Not a grid |
| Stock, lubricants | a table | Not a grid |

**Tanks are genuinely fixed**, not merely two today: `actions.js` only ever
*updates* a tank and there is no add-a-tank UI, so the count is what migrations
004/012/013 seeded. Coupled, but not variable.

**The Dashboard's by-fuel grid does vary** — `get_daily_summary` builds
`by_fuel_type` by grouping the day's `nozzle_readings`, so a day with only
petrol entered yields one entry. (No such day exists in the data yet; every day
so far has both.) **It still does not want the customer page's fix.** Rendered
one-fuel three ways at 1600px — as it is, full width, and held to half — and
full width was plainly the worst: the litres figure ends a hand's width from its
own heading and the three money figures spread across 1,300px.

**The distinction, which is now in `UI_CONVENTIONS.md`:** the customer page's
grid was *inside a card*, so its empty half was white card surface with nothing
on it — which reads as a figure that failed to load, and is exactly how the
owner read it. These sit on page background, where one card in a two-column row
reads as one card and the space beside it is simply the page.

**Ask what is behind the gap, not whether the count varies.** Card surface is a
hole; page background is a margin. No code changed.

## The sidebar: a burger on the laptop, and pinnable

Two requests, one after the other. The sidebar was a permanent 240px column
above 1024px, so a 14in 1600x900 laptop carried it always — and it only became a
burger if the window was dragged narrower than 1024. And there was no way to
keep the menu open once it was: the drawer closed itself on every navigation.

**Asked once before and answered with a measurement that said no.** That
measurement was right about what it measured — hiding the sidebar bought zero
extra rows, because the *content cap* and not the sidebar was holding the page
at 1152px, and a sidebar costs width where a short screen is short of height.
What it did not weigh is that 240px of permanent nav on a physically small 14in
panel is a real cost even when the pixel count says otherwise, and that the same
screen answering two different ways as you resize is its own annoyance. Asked
again with that context, the answer changes.

**The breakpoint moves to 1620px** — where a window can hold the 240px column
and the 1360px content cap together. Picked so the content width barely moves
across it: 1360 with a burger at 1600, 1360 with the column at 1620. A
breakpoint that reflows the page is worse than either side of it.

**And the reader overrides it.** The burger pins the column open on anything but
a phone, and it stays across navigations and reloads until the close button in
its header puts it away. Below 1024px the burger still opens the overlay,
because a pinned column over a 400px screen leaves nothing to pin it beside.

**The choice is a cookie the ROOT layout reads**, stamping `data-nav` onto
`<html>` server-side — so the first paint is already right. Read on the client it
would paint one layout and jump to the other on every navigation. The toggle
writes both: the attribute for this instant, the cookie for the next request.

**Three classes, not repeated Tailwind variants**, because four elements in
three files have to agree about whether the column is standing: the column, the
burger bar, the drawer, and the content padding — which is applied in the admin
layout *and* in `ReadingsCashUpBar`. That is not a hypothetical: the bar carried
its own copy of the breakpoint, the layout's copy moved, and the bar sat
indented 240px for a column that was no longer there. `.nav-column`,
`.nav-when-burger` and `.nav-offset` in globals.css now hang off the one
attribute.

**One regression caught in review of my own change:** `pr-12` on the column
header, added to clear the close button, pushed *"Muhammad Sagheer · Owner"*
onto two lines — the exact squeeze the drawer's own comment warns about. The
block is centred and the logo row leaves the corner empty, so the button sits
over nothing and the padding was dropped.

**Verified at 1600x780 through the whole cycle** — fresh (burger), pin,
client-side navigation, full reload, hide, reload again — each step asserting
`data-nav`, the column's computed display, the burger bar's, the content
padding and the cookie. Plus a phone check that the burger still opens the
overlay and does not pin.

## Printing what a customer still owes, fill by fill

The customer page could show a balance and it could show the whole ledger, and
neither is the thing you take with you when you go to collect. The owner asked
for the missing document: *"a customer has due of 51k, then the print button
should print a full statement which combines all the pending dues, till 51k is
adjusted, if the customer already paid in between, it should skip those."*

**That is an open-item statement, and it has a name because everyone who sells
on credit needs one.** The two standard shapes are *balance forward* — a period's
activity with a figure carried in at the top — and *open item*, which lists only
what is unpaid or part-paid and shows what is left on each line. Open item is the
collecting document: the one you can put in front of someone and go down line by
line. It is what was asked for, arrived at from the trade rather than from a
textbook, and it is what `app/_lib/customer-statement.js` builds.

**Payments are applied oldest first, and the page says so.** Nothing in
`ledger_entries` records which payment settled which fill and nothing could — a
haulier hands over Rs 50,000 against a running account, not against three named
slips. So the allocation is a convention, the same one every running account
uses, and the PDF prints the sentence *"payments are applied to the oldest fill
first"* rather than presenting an allocation as a measurement. The **total** is
not a convention: whatever the allocation does, the open items sum to the
balance, because they are the same rows summed the same way.

**Corrections are paired off before any of that happens, and this was the bug
worth catching.** A correction (063) is a reversal carrying `corrects_entry_id`
plus a replacement. Run it through oldest-first allocation naively and that
reversal — an ordinary credit as far as the walk is concerned — pays off the
oldest *open* fill instead of the one it was written to cancel. A mistyped entry
from August would then silently settle a real fill from September, and the
statement would drop a fill the customer genuinely owes for while still totalling
correctly. Both rows of every pair are removed before allocation starts; they net
to zero by construction, so the balance is untouched. There is a check for it.

**A day range narrows what is LISTED, never what is owed.** "Last 30 days"
itemises the fills inside the window and collapses everything still open from
before it into one *"brought forward"* line naming how many fills and how far
back they start. A statement whose lines do not add up to its total is worse than
no statement — it is an argument waiting to happen — so the carried line is not
optional, and the empty-window case (nothing new taken on credit at all) prints a
sentence saying so rather than an empty table above a large total.

**The ageing bands are 7 / 15 / 30 and not 30 / 60 / 90.** The textbook bands
come from net-30 invoice terms; this pump's entire credit cycle finishes inside
the first one, so all four standard bands would read "everything is current" on
an account three weeks late. The bands follow the trade the owner described: a
week is normal, a fortnight is the usual outside edge, a month is late, past a
month is what to chase today.

**Payments in the period are listed even though their fills are not.** The fills
a payment cleared are gone from the list, which is what was asked for — but a man
who paid Rs 25,000 last week and is handed a page that never mentions it will ask
where it went, and he is right to. Skipping the fills and acknowledging the
payments is the difference between a demand and a statement.

**A generated PDF rather than a print stylesheet**, because of where the page
goes after it leaves the app: onto WhatsApp to a haulier who will not come to the
office, into a folder against the day a figure is disputed, and only sometimes
onto paper. A browser print dialog serves the last of those three reliably and
the first two only if the person holding the tablet knows where "Save as PDF"
hides. `pdf-lib` draws it; Helvetica is a built-in font so nothing is embedded.

**Three faults the first render caught, none of which a DOM check would have.**
Every date printed as *"11 Aug 2..."* — the column had been measured off the word
"Date" rather than off a date, and the year is exactly the part that settles an
argument about an old fill. An ordinary ten-fill account pushed its closing note
and signature strip onto a second page holding nothing else, which is the page
someone hands over by mistake while the copy that matters stays in the printer;
moving the logo beside the business name instead of above it, plus 3pt off each
table row, brought it back to one page. And that second page carried a repeat of
the column headings above no rows at all, because the continuation header was
drawn unconditionally rather than only while the table was the thing that broke.

**A latent trap removed on the way past.** `helpers.js` exported `saleAmount`
twice — the re-export of the integer-math version from `format-helpers.js` and a
local `roundMoney(litres * rate)` copy, which is the binary-double multiply
migration 052 exists to remove. Two exports of one name is a SyntaxError under
strict ESM; webpack tolerated it and picked one, so which implementation a caller
got was down to the bundler. Nothing imported it from there — every caller reaches
into `format-helpers.js` directly — so it was a trap rather than a live bug, and
the wrong implementation is the one that went.

**Verified by rendering, not by reading the code.** Seven shapes — everything
owed, three day windows, a settled account, a bare customer with no phone or
vehicle, and a 34-fill account that genuinely runs to two pages — each rendered
to PNG through pdf.js in Chromium and looked at, each asserting that the listed
lines plus the carried-forward line equal the total. Plus fifteen checks on the
allocation itself (bulk payment, part payments, the correction pair, overpayment,
paisa dust, the window, the bands) and the dialog screenshotted at 1152, 1024 and
400px.

## The statement did not add up, and nothing on it said so

The first statement printed against a real account was wrong, and the way it was
wrong is worth the entry. **Usama Bahawalpur Ref.Haseeb**, 10 Sep 2026: three
unpaid fills listed at Rs 500, Rs 5,500 and Rs 6,000 — Rs 12,000 — under a total
that read **Rs 10,100**. Every line was individually defensible. The page as a
whole was worthless, because the one thing a statement has to do is add up.

**Money paid ahead of the fills was being dropped on the floor.** The allocation
walked the ledger applying payments to the oldest open fill, and when a payment
was bigger than everything open at that moment the remainder went into a variable
called `unapplied` and was never spent again. On 1 Sep this customer settled
Rs 16,000 against Rs 14,100 of open fills; the Rs 1,900 over vanished, and every
fill he took afterwards was billed as though the money had never come in. The
remainder is now a **standing credit** that the next fill is charged against
before anything is asked for — which is simply what a credit balance is. It is
not the customer's problem that his money arrived on Tuesday and his diesel on
Thursday.

**A deleted nozzle entry was being shown as a payment he had made.** The ledger
has two ways of cancelling a row and only one of them was being paired off.
A hand correction (063) carries `corrects_entry_id` and was handled from the
start; a **deleted sale** (014, 015, 024) posts a plain credit with no such
column — the README's *"deleting a reading reverses its credit slips, it does not
erase them"*. A deleted 10 Aug reading had put a Rs 5,001 credit on this account,
and the statement listed it under PAYMENTS RECEIVED, making "Total received" read
Rs 35,501 against the Rs 30,500 he had actually handed over. On a page you give
to the person you are asking to pay, that is a receipt for money he never paid.
These are now matched to the fill they cancel on date and amount — all three
functions write the reversal with the slip's own amount and date, and the
`credit_sale` row is deleted in the same statement, so no id survives to join on.
The `"Reversal - "` note prefix is generated by Postgres and never typed, which
is what makes it safe to key on. A reversal that finds no partner is left alone
and treated as an ordinary credit.

**The check that should have existed from the start.** `buildStatement` now
reconciles what it listed against the balance Postgres reported, and carries any
difference out as `discrepancy` — drawn as its own line immediately above the
total, on the page and on screen. It is zero on every statement the code can now
produce. It exists because it was once not zero and nothing anywhere said so, and
because the difference between a document that is wrong and a document that is
lying is whether it admits it. Standing credit is part of that sum rather than an
exception to it, or every customer in hand would trip the flag.

## Seeing the statement before printing it

Asked for directly, and the bug above is the argument for it: the only way to
find out what was on the statement was to open the file, so a page whose lines
did not reach its own total got as far as being printed. Nothing on screen was
ever going to catch that, because the screen was not showing the statement.

**The dialog is now the statement.** Total due, the ageing bands, the unpaid
fills with what has come off each, the payments received, and the same
carried-forward line the PDF prints — checked against the ledger sitting
underneath on the same page, before anything is downloaded.

**It shares the arithmetic rather than repeating it.** `buildStatement` split into
`allocatePayments` (needs the whole ledger, runs once on the server) and
`statementFromParts` (pure windowing, runs anywhere). The customer page does the
allocation and passes it down as a prop; changing the day range re-windows in the
browser with no round trip; the download route calls the same function again. One
code path, three callers. A preview that computed its own figures would be worse
than none — it would agree with the file right up until the day it quietly
stopped.

**And the range picker got its argument back.** *"The range changes what is
listed, never what is owed"* used to be a sentence in a grey box. Now the reader
taps "Last 7 days" and watches the list shorten while the total stays put and a
carried-forward line appears, which is a far stronger way to make a promise about
arithmetic. The five stacked radio cards became one row of chips: the preview is
what deserves the vertical space, and what each range does is visible a tap later.

**`formatPKR` and `roundRupees` moved to `format-helpers.js`**, re-exported from
`helpers.js` so every server caller is unchanged. Same arrangement the dates
already use, and the same reason: `helpers.js` reaches into request cookies and
cannot go in a browser bundle, while the preview has to format money identically
to the PDF. The alternative was a hand-rolled `showMoney` in the component, which
is the drift this whole feature is trying to avoid.

**Verified against the real ledger.** This customer's actual sixteen entries are
now a regression fixture asserting the corrected figures — 07 Sep Rs 5,500 with
Rs 1,400 off leaving Rs 4,100, plus 08 Sep Rs 6,000, totalling the Rs 10,100 the
screen shows — that the deleted-reading reversal is not listed as a payment, and
that total received is Rs 30,500. Eight PDF shapes re-rendered and looked at,
including a customer in credit; the dialog screenshotted at 1152 and 400px, where
the summary rows now span the first four columns because "Total now due" was
wrapping onto three lines in a phone-width Detail cell.


## The Balance column was counting from zero on every page

Reported by the owner as something else entirely, which is the usual way: *"when
a statement is printed it shows some unusual values such as 4980 paid off, when I
saw the customer transaction history there is no such number."* Two separate
things were behind it, and only one of them was a bug.

### The bug: a running total worked out over a page

`CustomerLedgerTable` was written when the customer page listed the WHOLE ledger.
It sorted the rows oldest first, ran a total through them from zero, and printed
it against each row — "what was owed immediately after this entry", which is how
a paper khata reads and was exactly right at the time. Then the ledger got a pager
(25 rows a page, commit `43bffdc`), and the same loop kept running, now over a
page.

Zero is the balance before the customer's *first ever* entry, and that entry is on
the *last* page. So every figure in the column was out by the net of everything
older than the page, and page 1 was out by the most. Al Jadeed's page showed **Rs
−59,728** against his newest entry while the card above it said he owed Rs 97,515
— not merely the wrong number but the wrong side of zero, a page saying the pump
owed *him* sixty thousand rupees. His recent 25 rows happen to hold several large
payments, which is what made the page-local total negative; a customer whose
recent page is mostly fills would have seen a figure that was merely too small,
which is worse, because nothing about it looks wrong.

Reproduced against a local Postgres with all 63 migrations applied and a 47-entry
ledger: the newest row read Rs 83,990 where `customer_balance()` said Rs 205,475,
out by exactly the net of pages 2 and 3.

**The fix is migration 064**, and it is a window function rather than a bigger
fetch. Fetching the whole ledger again to slice it in JavaScript gives back the
reason the table is paged, and puts a money figure into a double — a running
balance is `customer_balance()` stopped part way, and the two must agree to the
paisa on the last row or the column is lying again in a quieter way.
`get_ledger_entries_page()` sums

    sum(case when entry_type='debit' then amount else -amount end)
      over (order by entry_date, created_at, id)

over every row the customer has and takes the page *afterwards*, so a row reads
the same whichever page it falls on. The same call returns the pager's count and
the ids of every cancelled entry (which the table needs for the whole customer,
not the page, because `corrects_entry_id` points forward) — three answers, one
round trip, where there were two queries and a loop.

`id` is the third sort key on purpose. A correction (063) writes its reversal and
its replacement in one statement, so both carry an identical `created_at`;
date-plus-time is not a total order, and without a final tiebreak the running sum
and the list could walk the ledger in different orders. It is the same triple
`oldestFirst()` in `customer-statement.js` already used.

### Not a bug: Rs 4,980, and why the statement changed anyway

The Rs 4,980 was arithmetic, not a stored figure, and it was correct. The
statement was an **open-item** statement — only the fills still unpaid, each
showing how much of it had been covered, payments applied oldest-first — so a Rs
5,000 fill from 31 August printed as "Rs 4,980 paid off, Rs 20 still due" because
that was the tail of a payment already spread across four earlier fills. The lines
summed exactly to the Rs 97,515 the database says is owed.

It was still the wrong document, and the owner found out the way these things are
always found out, by reading one and going looking for the number. **A statement
is checked by finding its figures somewhere else.** Rs 4,980 appears nowhere in
the ledger; it needed a footnote about oldest-first allocation before it meant
anything at all, and a figure that needs a footnote to survive being read is the
wrong figure.

So, asked for by the owner in the same breath — *"make it so that it prints all
the statement, all payments received, and payment dues, not just the pending
amount, and it should also show just as a total due"* — the statement is now
**balance-forward**: every fill and every payment, oldest first, each line
carrying the balance standing after it, ending in one **total now due**. The same
five columns as the transaction history underneath it, so the owner reads a figure
on the statement, looks down at the screen, and the two agree row for row. That
agreement is the point of the whole round: it is what the old design could not
offer, and what the page-local balance column had been quietly breaking.

**What went, and what replaced it.** `allocatePayments` / `statementFromParts` /
`listPayments` / `AGE_BANDS` / `ageOpenItems` are gone, with the ageing strip and
the separate PAYMENTS RECEIVED block. `prepareAccountRows` (whole ledger, once on
the server) and `accountFromParts` (pure windowing, runs in the browser and in the
download route) replace them, same split and same reasoning as before. The day
range still changes what is listed and never what is owed: shorten it and
everything earlier collapses into one **balance brought forward** line, read off
the last row before the cutoff rather than summed.

**Corrections are on the page and are not money.** Nothing here is ever deleted,
so a cancelled entry and the row cancelling it both print, greyed, labelled
"Cancelled" and "Cancels the entry above", and kept out of the *fuel taken* and
*paid* subtotals; only the balance column carries them. The hard-won matching from
the old file survives as `cancelledPairIds` — hand corrections by
`corrects_entry_id`, deleted sales (014/015/024) by date and amount against the
"Reversal - " note Postgres writes. An unpartnered reversal is now counted as a
correction rather than as a payment, which is the safer half of the guess: listing
one as money received is what once told a customer he had paid Rs 5,001 he had
never handed over.

**The period subtotals are the only figures the JavaScript works out**, and they
go through a new `sumMoney()` in `format-helpers.js` that adds integer paisa —
twenty fills at Rs 73,543.23 come to Rs 1,470,864.60 and not the
Rs 1,470,864.5999999999 a naive sum gives. The check that the page adds up
survives in the new shape: opening + fuel taken − paid + corrections must equal
the balance Postgres reports, or the statement prints "Other movements on the
account" as its own line rather than a column that quietly fails to reach its own
total.

**Written for the person being asked to pay.** The owner's note: *"this statement
will be read by a layman customer, don't include any complex explanations."* The
footnote explaining allocation is gone because there is no longer a convention to
explain; what is left is four short lines and a signature strip. `ascii()` already
turns every dash into a hyphen on the way into the PDF.

**Verified.** All 63 migrations plus 064 applied to a local Postgres; the bug
reproduced and then the newest row checked equal to `customer_balance()` on page
1, page 2 checked to continue with no gap, and the three rows of a real
`correct_ledger_entry()` pair checked to read 169,975 → 167,475 → 167,725. The
statement arithmetic asserted over the whole account and a 15-day window (both
reaching the balance exactly, discrepancy zero), plus a deleted-sale reversal kept
out of *paid*, a correction pair split across the cutoff (corrections −5,001, still
adds up), an account in credit, an empty account, and the paisa case above.
Rendered at 1152px and 400px, and three PDFs looked at page by page: the whole
account (3 pages, continuation heads repeating), a 15-day window, and a settled
account. Two things that only showed up in the rendering: the closing note was
being truncated to "...is in the balance brought fo..." because `fit()` cuts
rather than wraps, and both halves of a correction were labelled "Correction",
which tells the customer the wrong thing about whichever row he is looking at.


## The statement's period became a date range

Asked for directly: *"instead of statement being printed for last x number of
days, make it so that the owner can select a date range."*

The picker offered fixed windows — 7, 15, 30, 90 days back from today, plus a
typed number of days — and those cannot say what collecting actually needs said.
A haulier settling for August wants August. "The last 45 days" drags half of July
onto the page and then stops at today rather than at the 31st.
`docs/UI_CONVENTIONS.md` already drew this line for the Daily Register, in
`<RegisterRange>`'s own note: a fixed window answers "how are we doing lately", a
from/to pair answers "these particular days, which I chose". Collecting is the
second kind, and had the wrong control.

**Two dates, either able to be blank**, blank meaning no limit at that end — so
"the whole account" is now the same control with both boxes empty rather than a
mode of its own. Four chips (the whole account, this month, last month, last 30
days) FILL the boxes rather than replacing them, so "last month but up to the
28th" is a tap and a nudge; a chip lights up whenever the dates match it,
including after they were typed by hand. Either end drags the other rather than
being refused, the rule `<RegisterRange>` follows, and `statementRange()` swaps
them again on the server because a URL can be hand-edited and is not a control.

### The part that was not just a swap

A window that always ends today can always close with the current balance. **A
range cannot**, and this is the whole of the interesting work in this round.
Print 1–31 August on an account that has traded since and the September entries
must be either listed (so the range was not honoured) or dropped from a total
still labelled "total now due" (so the largest figure on the page asks for the
wrong money).

So a statement whose period ends in the past closes with the balance AS AT that
date — read off the last row inside the window, a Postgres figure like every
other balance on the page — and says so: **"Balance as at 31 Aug 2026"** instead
of "Total now due", in the headline panel, in the table footer, and in the
closing note. `isCurrent` on the statement carries it, and both renderers switch
on the same flag so the screen and the PDF cannot disagree about which of the two
documents this is. `customer_balance()` is still what a current statement prints;
the row-derived closing figure only takes over when the period stops short.

Knock-on, same reasoning: **the last payment shown is the last one on or before
the end date.** A statement for August that mentions a payment made in September
contradicts its own closing figure.

`days` / `cutoff` / `STATEMENT_RANGES` / `MAX_STATEMENT_DAYS` are gone, replaced
by `from` / `to` / `asAt` / `isCurrent`, `statementPresets()`, `statementDate()`
and `statementRange()`. The route takes `?from=&to=`. An unparseable date is
IGNORED rather than refused — the statement is still correct without it, and
failing a download over a query string nobody typed would be pedantry. The year
bound is `DateJump`'s, and for its reason: a native date box reports 0006-08-06
while somebody is still typing 2026, which would otherwise redraw the preview
against the year 6 mid-keystroke.

**Verified.** Six windows over a fixture built to have entries either side of
them — the whole account, August only, from 1 Aug onwards, everything up to 31
Aug, September so far, and a period containing no entries at all — each checked
to satisfy opening + fuel taken − paid + corrections = closing, with `isCurrent`,
`asAt` and the last payment correct in each. A backwards range swaps; `0006-08-06`
and `not-a-date` are ignored; the presets land on 2026-08-01..2026-08-31 for last
month. Three PDFs read page by page (August only, everything up to 15 Aug, from 1
Sep onwards) confirming the "Covering" line in all four of its shapes and the
closing label in both of its. The dialog rendered at 1152px and 400px — where the
first build clipped both date boxes to "08/01/202", losing the year, until the
pair got a min-width that pushes Clear onto its own line.

## The Dashboard gets a complete new look, and the rest of the site is to follow it

_"redesign the dashboard page only, do not touch the live database, i want a
complete new look, i will make the whole site match the dashboard styling
later."_ So this round is two things at once: a redesign of one page, and the
first draft of the look every other page will be moved to. The new pieces are
named for the app, not for the Dashboard, and `UI_CONVENTIONS.md` → "The new
look" is written as the brief for that rollout.

**Nothing about the data changed.** The same three RPCs, called the same way, in
parallel; no migration; the live database was never connected to. Every figure
on the page is the figure the old page showed, with the two deliberate exceptions
below, both of which make a figure agree with the card it is on.

**Built on a branch and handed back for a look before it goes anywhere**, the
pattern the zones regrouping set for a redesign of taste: it is not done until
the person who reads it every morning says so.

### What the page is now

Top to bottom, in the order a morning check runs:

1. **The day, as the page's heading.** `DayHeader` puts "Saturday, 26 Sep 2026"
   at 30px with its relative label ("Today", "Yesterday", "Past day", "Future
   date") in a panel washed by the kind of day - white with a green edge for
   today, slate for the past, amber for the future - and the arrows, the date
   box and "Back to today" beside it. Every rule `DateNav` carries still holds:
   said once, with the weekday, always labelled, the native date box only a way
   to jump, the chart window carried through every control.
2. **Four headline cards** - Total sales, Cash, On credit, Fuel sold, in that
   order now, so the money reads total = cash + credit left to right. Each is an
   icon tile in its meaning colour, a 16px label, the figure at 30px, a
   description, the percent pill, and the trend as a band along the card's
   bottom edge, full width at every size.
3. **Fuel: one card per fuel.** Diesel and petrol each get a single card holding
   what that fuel sold on the day (litres, then sales, cash and credit as small
   tiles), its tank at the close of the day - drawn as an upright tank filled in
   the fuel's colour, with the litres, the percent full, the capacity and the
   dip's gain or loss written beside it - and the month so far. The old page
   spread the same facts over three sections and five blocks, petrol and diesel
   interleaved in each. The delivery line follows the two cards.
4. **Lubricants**: the counter and the shelf as two panels banded in lubricant's
   gold, as the fuel cards are banded in theirs. A product that has run out says
   **"Out of stock"** in words beside its red 0 L - the old card said it with the
   colour alone.
5. **Trends**: the same three charts, redrawn - 12px axis text (it was 11px, under
   the caption floor), days as "26 Sep" rather than "26/09", the legend as words
   in the header in the order the bars stack, and a tooltip that names the
   weekday and gives the day's total.

### Two decisions worth knowing before changing them

**Credit is violet on the new page, tile and chart alike.** The old tile said
"credit" in amber while the chart under it drew credit in violet - the pair
`CashCreditChart` chose with a palette validator because green/violet survives
red-green colour blindness and green/amber does not. Amber is also the one chrome
colour a fuel owns (diesel, six degrees away), which is why the old tiles could
never give credit a coloured sparkline. Violet belongs to no fuel, so credit now
has a real tile and a real line in the same colour as its bars. Amber is left
meaning a warning. `app/_components/admin/dashboard/tones.js` has the whole map.

**The fuel colours stay quiet.** A fuel card's band is the fuel's `soft` pair and
the tank fills with its `solid` pair; the loud filled band is still rationed to
the Stock page, where typing into the wrong card costs something.

### What rendering it caught

Screenshots and `render-check.mjs` at eighteen widths from 320 to 1600, with
fixtures shaped like the real day (seven-figure takings, the long "Caltex
Havoline Formula 20W-50 (4 L carton)", an out-of-stock product) and the awkward
days (nothing entered, only petrol entered, a busy day, stock below zero, no dip,
more than half on credit, past, yesterday and future dates). Five real defects,
all fixed before this was committed:

- **A seven-figure sale ran out of its tile at 1024px.** Three figure tiles across
  at 27rem of card left 113px for "Rs 1,538,860"; an ordinary day's six figures
  never showed it. The threshold is 36rem, measured, and lives in one file.
- **"Rs 1,375" broke after the "Rs"** in the Total sales description on a narrow
  card - the exact failure "Money inside a sentence" warns about. Each figure in
  a description is its own nowrap span now.
- **Labels wrapped beside the percent pill** ("Total / sales") when four cards
  shared 992px. Four across now waits for 72rem of grid, and a label never wraps -
  the pill drops a line instead.
- **The section header's neutral tile vanished**, being `ink-100` on an `ink-100`
  page. Neutral tiles are `ink-200`.
- **The chart window broke three-and-one on a phone** ("90 days" alone on a second
  line). A 2 x 2 grid on a phone, four across from 30rem, a row beside the heading
  from 48rem.

### Two things the old page did that this one does not

**No "down 100%" on a day that has not been entered.** Every evening until the
readings were typed, all four old tiles showed a red "↘ 100.0%" over "No readings
entered for this day" - true arithmetic, wrong message: it is a missing day, not a
collapse in sales. It is the mirror of the rule `DeltaBadge` already keeps for a
zero baseline, so a day with no fuel readings now shows no comparison on any card.
A day with readings and genuinely no credit still shows its fall.

**The sparkline plots the figure on its card.** The old Total sales, Cash and On
credit tiles showed fuel-plus-oil figures over FUEL-ONLY lines, so hovering today
read Rs 750,819 on a card saying Rs 752,194. The badges had been made exact by
migration 043; the lines had not. The series is now built exactly as the figure
is, fuel plus oil, added in paisa by `sumMoney`, matched by day.

### How it is built

- `app/admin/page.js` is the role check and the three queries; the page is
  `app/_components/admin/dashboard/DashboardView.js`. The split is what let a
  devcheck route render the real page from fixtures instead of a copy of it.
- New components in `app/_components/admin/dashboard/`; new classes (`.panel`,
  `.icon-tile`, `.caption`, `.seg*`) at the end of `globals.css`. Nothing outside
  the Dashboard uses them yet, and nothing shared was restyled: `StatTile`,
  `.card`, `DateNav`, `TrendRange` and the three old charts are untouched, because
  Readings, Stock, Lubricants, Treasury, Reports and six other pages still use
  them. The old charts and `DateNav` are to be deleted once the rollout has moved
  their last callers.
- `app/admin/loading.js` has the new shapes. It is also what Activity, Banking and
  Company Assets show while loading, as it already was.

### Not done, and said so

- **Not seen against the live database.** Everything above was rendered from
  fixtures through the real `DashboardView`; the page itself only adds the role
  check and the fetch, which did not change. The first real look is the owner's.
- **No "low stock" badge on the shelf.** The Lubricants page marks a product low
  below one pack, but `get_daily_summary` does not return pack sizes, and adding
  a query was out of scope for a redesign. `getLubricants()` already has them if
  it is wanted.
- **The rest of the site.** "Moving another page over" in `UI_CONVENTIONS.md` is
  the procedure.
- Noticed while rendering, not touched because it is the shared sidebar: with the
  menu pinned open, **Sign out renders as a green filled button**, because
  `SubmitButton` defaults to `variant="primary"` and the sidebar passes only a
  className. Same on the old page.

## Daily readings, in the new look

_"now the reading page redesign"_ — the second page moved to the look the
Dashboard set, and the one where a mistake costs the most, so it moved
carefully. **Every behaviour is unchanged**: the same two queries, the dialog
with one nozzle in it (inline entry was built and reverted here once; it stays
reverted), the overlap refusal, the gap checkbox, the chain warnings, the
changeover-day labels, delete and Clear this day, and the cash-up bar that
appears only once the totals have scrolled away. The unit band still wears its
fuel's `solid` colour and an entered nozzle is still washed in its fuel's tint,
both at the owner's earlier request.

**What changed is the surface.** The day is the page's heading in `DayHeader`,
which now takes a title, an icon and a slot for Clear this day. The totals are
four `KpiCard`s. Units are `.panel`s with a larger, sentence-case header naming
the fuel in words. The skipped-day and missing-rate warnings are tinted panels
with an icon. Captions are sentence case; chain warnings are 14px, up from
12px, being sentences someone has to read before saving. And the two black
surfaces are gone — the running total in the entry dialog is now the nozzle's
own fuel tint with 24px figures, and the cash-up bar is a white panel lifted by
a strong shadow.

The day's cash and credit totals are added with `sumMoney` now, not a bare `+`.

**What rendering it caught:** at 360px and below, the nozzle card's two figure
columns were too narrow for a seven-figure day. The old card never showed it,
because its figures were `truncate` — "Rs 1,538,..." with an ellipsis, a wrong
figure on screen. The figures are nowrap now, and below 19rem of card they go
one per row, label left and figure right. Checked with `render-check.mjs` at
1600, 1366, 1152, 1024, 768, 400, 360 and 320 across a part-entered day with a
skipped day behind it, a pump-changeover day (two Unit 1s) and a day with no
rate; the entry dialog (with a credit slip and the gap checkbox) and the saved
dialog opened at 1600 and 400; the cash-up bar read at the bottom of a phone.
Rendered from fixtures through the real `ReadingsView`; not yet seen against the
live database.

## Stock, in the new look

Merged the Dashboard and Readings work to `main` first (a fast-forward, at the
owner's instruction), then moved the Stock page over on the same branch.

**Unchanged**: the three queries, the morning/evening choice and the day a dip
closes (migration 039), the first-dip rule that refuses to call a disagreement
with the typed opening stock a "gain", the over-capacity and below-zero
warnings, clearing a mistyped dip, the toast that empties the box after a save,
and the history sliced rather than paged in Postgres.

**New surface.** The day header; a `SectionHeader` for each of the three zones.
The dip card is a `.panel` that keeps the page's one loud band — the fuel's
`solid` fill, now with `.fuel-band`'s sheen, the same band the Readings unit
header wears — and a stronger lift than anything else on the page, because a
dip is the baseline every later day is measured from. Beside the book figure is
the Dashboard's `TankGauge`. The result of a dip, both the preview while typing
and the recorded one, is one line with a tick or an arrow beside the words.
Warnings are 14px sentences, up from 12px. Tables sit in panels with
sentence-case headings.

**Two things the old page said with colour alone now say in words.** The shelf's
"In stock" figure was red when a product had run out and amber when it was low,
and nothing else; it now carries **Out of stock** / **Low** badges on the
Lubricants page's own rule (below one pack; ten litres for the drum, whose flag
`get_lubricant_stock` already returned). And the drum's row no longer reads "0 L
pack" — it says "loose, from the drum", with its litres to the third decimal.

**What rendering caught**: at 320px the book figure at 30px beside the gauge
needed about 190px of the 160 the card leaves it — it steps down to 24px below
19rem of card. And `.table-scroll`'s phone-width bleed, clipped by the new
panel, was reported as the tables escaping their cards; it takes `mx-0 px-0`
inside a panel now (recorded in `UI_CONVENTIONS.md`). Checked at 1600 to 320
across a normal day (one tank dipped, one still to do), a first-ever dip, a
tank over capacity on the books and one below zero; the shelf table was looked
at scrolled to its end on a phone. From fixtures through the real `StockView`;
not yet seen against the live database.

**And one the first round of screenshots missed**, found re-rendering for the
owner: a dip's note had a sixth column of its own, and a column of free text in
a table whose other five never wrap gets what they leave — 112px. A 60-character
note went one word to a line, its row 201px against 53 for the rest, and the
table's 776px scrolled sideways at 768 (a tablet held upright) and at 1024 with
the sidebar pinned. The note is now a line under the day, the way Banking and
Lubricants carry theirs: the table fits from 768 up and scrolls only on a
phone, where the note is read without scrolling at all; the row is 97px (117 on
a phone). The rule is in `UI_CONVENTIONS.md` → "Tables in the new look", because
Expenses still has a Note column.

## The rest of the site, in the new look

After Stock, the owner asked for every remaining page and subpage to be moved
over, and for no em dashes anywhere on them. This entry grows a section per
step as the pages move.

### The shell and the shared pieces

**The sidebar.** Each section's glyph now sits in a 32px icon tile, pale slate,
and the open section's tile is filled green with a white glyph: a fourth mark
beside the band, the bold label and the dark bar, and the one that survives
daylight best. Rows are still 44px, so the column fits a short window as before.
**Sign out was a filled green button** and is now the red outlined `danger`
button the conventions always named for it: it had been left at
`SubmitButton`'s default variant, and the red styles written on it lost to
MUI's own. The top bar's business name fitted from 400px up and truncated at
360, the commonest Android width; below 400px the logo, the gaps and the name
step down a little and it fits from 360. At 320 it still truncates.

**The login screen** is a `.panel` in the primary green's wash, the name as a
real heading at 20 to 24px, and a large Sign in button.

**New shared pieces** in `app/_components/admin/dashboard/`: `TitleHeader` (the
top of a page with no date, replacing `PageHeader`), `KpiGrid` (the row of
`KpiCard`s, replacing `StatGrid`) and `Notice` (lifted out of Readings).
`WASH` in `tones.js` gives each page header the palest shade of its tone; not
slate, which on `DayHeader` means a past day.

**Changed in place, because every page was moving:** `.th` in sentence case,
12px corners on inputs, the MUI theme giving every button a 12px corner and the
secondary button a hairline instead of a near-black outline, `<Dialog>` with
24px corners and an 18px title (it was 14px), and `<EmptyState>` as a panel with
its sentence at 16px.

Checked from a fixture page with `render-check.mjs` at 1600 to 320 (clean apart
from the name at 320), with the open section shown by rendering the real
sidebar under a stand-in pathname, and the drawer, a dialog and the login
screen screenshotted at laptop and phone widths.

### Purchases

`PurchasesView`, with the page reduced to the role check and the four queries.
The header carries the record buttons; what is still owed to suppliers is an
amber `Notice`; the table sits in a panel.

**The rate moved under its cost, and the table lost a column for it.** In the
new look's type the eight columns left the item and the supplier about 360px
between them at 1152: supplier names wrapped three lines deep and invoice
numbers broke after their first hyphen. That is the squeeze the "Purchases page"
entry above rejected once already, so the fix was not to squeeze harder but to
give the width back: the rate is arithmetic on the two figures beside it and is
read with the cost, so it is a second line under the cost now. Measured with
the fixture's real-length names: fits at 1600, at 1366 beside a pinned sidebar
and at 1152; scrolls inside its panel at 1024, as settled before. Below 1024,
where the table scrolls anyway, the item column is wider so a long lubricant
name wraps to three lines rather than five.

Also: the owed and lubricant-spend totals are added with `sumMoney` (they were
running double additions); the hidden Actions heading is a hidden span in a
real cell, because `sr-only` on the `<th>` took the column out of the table's
layout and the heading band stopped short of the trash buttons; the payment
toggle is 14px (was 12px, with its unselected option under the contrast floor);
"20W-50" no longer breaks at its hyphen (`nonBreakingHyphens`). Both record
dialogs lost their black rate boxes for `.figure-box` and their 12px hints for
`.callout`, and their three em dashes for ordinary punctuation.

The Stock page's dip history got its pinned column headings back: its first
new-look cut switched the table's height cap off (`max-h-none`), and the cap is
what makes the headings stick.

Verified from fixtures (26 deliveries, two lubricant purchases with long names,
owner, staff, empty and no-lubricant variants) with `render-check.mjs` at 1600
to 320, the delivery dialog filled with a tanker that will not fit, and the
table measured column by column at 1600, 1366 with the sidebar, 1152 and 1024.

### Lubricants

`LubricantsView`, with the page reduced to the role check and the queries. The
loose-oil route is still only a redirect; its loading skeleton is the new page's
(and lost a typo, "saless").

`DayHeader` with the day's actions as one group in its control row; four
`KpiCard`s; the sales and the shelf under `SectionHeader`s; the packed/loose
filter as the `.seg` control. What changed beyond the look:

- **"Oil sold today" is "Oil sold".** On any other day's page it was untrue; the
  header already says which day.
- **The day's total is added with `sumMoney`** instead of a double addition of
  the two halves.
- **No dashes in the tables.** Zero credit shows a quiet `Rs 0`, a sale with no
  customer says "Cash sale" (the sale form requires a customer for any credit,
  so no customer means all cash), the drum's pack size says "By the rupee" (the
  Manage lubricants dialog's own words), a missing rate says "Not set" (an amber
  badge on the drum, where the rate is load-bearing).
- **The "loose" mark is neutral**, not amber: amber means a warning or money
  owed in this app, and loose is a kind of sale.
- **A sale's note is a `Note:` line under the product**, the rule from Stock.
- **Two buttons drawn wrong by MUI**, the same slip as Sign out: "Bring back" in
  Manage lubricants had link styles on a default (primary) `SubmitButton` and
  drew as a filled green button; it is a small secondary one now. And "Add a
  lubricant" sat flush against the list under it, because MUI's `margin: 0`
  outranks `space-y`.
- The three dialogs lost their black cash boxes and 12px hints for
  `.figure-box` and `.callout`, and their em dashes; their choice buttons went
  from 8px corners to the new look's 12px.

Verified from fixtures (23 sales on one day, long names, a credit customer, a
drum, a note; a shelf with low, out-of-stock, retired and no-rate rows; owner,
staff, empty and no-sales variants; the loose-only filter on a past day) with
`render-check.mjs` at 1600 to 320, and all three dialogs opened and filled in
at phone and laptop widths.

### Customers

`CustomersView` and `CustomerView`, both pages reduced to the role check and
the queries.

**The list**: four `KpiCard`s, the table in a panel that keeps its own header
bar (search and New customer against the table, as the owner asked) and its
ruling in both directions, and Removed under a `SectionHeader`. The total owed
is added with `sumMoney`. A customer with no credit limit reads "No limit"; one
with no phone has an empty cell, as a missing vehicle already had no line.

**One account**: `TitleHeader` with "All customers" as its back link in place of
a "Back to customers" button, the balance and the fuel taken as two panels, and
the ledger under a `SectionHeader`. The credit-limit line lost the dash before
"over by"; the amount over is worked out with `sumMoney`. The ledger and the
statement preview leave the unused Debit or Credit cell blank instead of a dash,
the way a ledger book does.

**What rendering caught:**

- **A seven-figure credit limit was clipped at every width**: it sat in a fixed
  96px box. Present before this round too; `w-fit min-w-24` now.
- **The list page scrolled sideways on a phone**, by 17px, after the missing
  phone's dash became an `sr-only` label: `sr-only` is absolutely positioned,
  a body cell is not, so the label escaped the table's scroller. The cell is
  simply empty now. (The render check reported this page "clean" once, on an
  HTTP 500 error page, while the fixture's helper files were missing; the
  scratch wrapper around it now refuses to report on a page that is not a 200.)
- On a phone, the ledger's Detail column held one or two words a line; it has a
  13rem floor below 1024px, where the table scrolls anyway, and none above,
  where the floor made it scroll beside a pinned sidebar.

**Buttons MUI drew wrong**, as on Lubricants: "Bring back" on the Removed list
was a default (primary) `SubmitButton` with link styles and drew filled green.
It is a small secondary button, and "Delete for good" beside it a small danger
one, two buttons of one size. The customer forms, the correction, payment,
adjustment and statement dialogs use the shared callouts and lost their em
dashes; the correction dialog's "Recorded now" is a `.figure-box`.

Verified from fixtures (six accounts: over a seven-figure limit, no limit, in
credit, no phone; a removed one; an account with 25 ledger rows including a
cancelled entry, its correction, a payment and auto-posted fills, one fuel and
two) with the render check at 1600 to 320, the ledger measured at 1024 with the
sidebar pinned, and the statement dialog opened.

### Banking

`BankingView`, the page reduced to the role check and the two queries. Three
`KpiCard`s for the totals (added with `sumMoney`; a negative total says
"Overdrawn" in words), each account a panel, and the transactions under a
`SectionHeader`.

**Where the form stands was measured, not kept.** The old page put the
transaction form beside the table from 1024px up. At exactly 1024 that left the
table 618px, and it scrolled; beside a pinned sidebar at 1366 it got 720, the
account and the purpose shared about 200 of it, and a transfer's note ran eleven
lines deep. The form now stands beside the table from 80rem of section, which
the owner's 1600px laptop has either way (the table gets about 950px), and
stacks above it below that.

**What rendering caught:** on a phone an account's name lost its last word to a
`truncate`, and its account number lost its last digit. Both wrap now, the
number held on one line. Also: a transfer's note is a `Note:` line under its
purpose, the account's delete is the app's trash button instead of the word
"Delete" at 12px in ink-500, the cover-from-other-accounts box and its "covers
it" chip went from 12px and 10.4px to 14px and 12px, an unset category says
"Paid out" instead of a dash, and three em dashes are gone.

Verified from fixtures (an account with a seven-figure balance and pruned
history, an overdrawn one, 30 transactions with categories and a long note)
with the render check at 1600 to 320 and the table measured at 1600, 1366,
1152 and 1024 with and without the sidebar.

### Treasury

`TreasuryView`, the page reduced to the role check and the two queries. Four
`KpiCard`s (the balance keeps its sparkline, and says "Below zero" in words when
it is), the day-by-day chart and the two breakdowns under one `SectionHeader`
with the new-look window control, and the day's sheet under a `SectionHeader`
whose title is the day.

**The chart joined the new look's frame.** `TreasuryBalanceChart` now uses the
pieces `TrendCharts.js` exports: 12px ink-600 axis text (it was 11px ink-500,
under both floors), days as "26 Sep" (it was "26/09"), the legend in words above
the plot, and the tooltip that names the weekday. What it draws is unchanged.

**The sheet's pinned balance column is untouched** in its mechanics and its
measured 11rem; its heading cell took the heading row's grey, where it had been
white and broke the band.

**What rendering caught:** the day's four figures, now at 18px, clipped two
across at 360px; they stack below 22rem of section. And at 320px a category
breakdown squeezed its name column narrower than "Deposited"; the figure now
drops to a line of its own there. Screenshots taken 0.4s after load showed the
balance line stopping halfway: that was its draw-in animation, confirmed by
shooting again at 2.5s.

Verified from fixtures (14 days with an Rs 1.59m payment on one of them, six
entries on the day with details, four and three categories, a landed-elsewhere
day) with the render check at 1600 to 320.

### Expenses

`ExpensesView`, the page reduced to the role check and the two queries. The
month picker and both record buttons in the header, three `KpiCard`s, and the
month under a `SectionHeader` with the breakdown beside the table where there
is room. The total, the recovered total and each category's sum are added with
`sumMoney`; they were double additions. The Note column is a line under the
category, as the Stock round's rule said it would be.

**What rendering caught:** the cards' labels had the month in them, and a card
label never wraps, so "Recovered in September 2026" ran out of its card on a
phone. The labels are "Spent" and "Recovered" and the month is the first thing
in the line under each figure (and the table's heading). A full-width month box
in the wrapping header pushed Show onto its own line at 1600; it takes its own
width now. Five em dashes left the record dialogs.

**Noticed and not changed:** the page loads a month's expenses with
`limit: 200` and totals what it loaded, so a month with more than 200 expenses
would show a short total. Not likely at this pump, and a data-layer change
rather than a redesign; it is written here so it is not forgotten.

Verified from fixtures (19 rows including a recovery, free-text categories as
long as "salary of haseeb and pump tea and lunch", two notes) with the render
check at 1600 to 320 and the table measured at four widths with and without
the sidebar.

### Assets

`CompanyAssetsView`, the page reduced to the role check and the two queries.
Four `KpiCard`s (worked out in the database across every asset, never over the
nine on screen, as before), and the asset cards as panels. The category colours
and their reasoning are carried over unchanged. `KpiCard` gained `tileClass`
so "Biggest holding" can keep wearing its category's hue. No dashes: an empty
holding or newest addition says "None yet". Three em dashes left the dialogs.

Verified from fixtures (nine assets across all five categories, names long
enough to wrap, a note, a seven-figure value) with the render check at 1600 to
320: clean apart from the top bar's name at 320.

### Reports, Daily sales and the register

`ReportsView`, `DailySalesView` and `RegisterView`, each page reduced to its
role check and its queries.

**Reports.** The month box, the register and the Excel download in the
header; the month as four cards with "How profit is worked out" under them as
the working rather than a warning, then cash, credit and what is owed to
suppliers as three more. The day-by-day charts are now the Dashboard's own two
(`FuelSalesChart`, `CashAgainstCreditChart`), drawn from the same rows the old
pair used. The month's cash, credit and owed totals are added with `sumMoney`,
where they were double additions. A tank with no dip in the month says
"No dip"; a lubricant not restocked says "None".

**Daily sales.** Reports is the header's back link and the table has a panel of
its own. Its cells went from 12px to 10px either side, because with the
panel's 20px edges it needed 892px of the 878 a pinned sidebar leaves at 1152,
and scrolled sideways there by 14px on an ordinary six-figure day. Measured
after: fits at 1600, 1366 and 1152 with or without the sidebar; scrolls inside
its panel at 1024 with the sidebar pinned, as every wide table does.

**The register graduated.** It was drawn in Material UI at the owner's request
while it was a preview, with money tiles that copied `StatTile` onto a `Paper`
and a note saying one of the two should go if the page ever stopped being a
preview. The new look is that decision. The money cards are `KpiCard`s (with
their comparisons against the equally long span before, and their
sparklines), the fuel cards are the Dashboard's fuel card cut to this page's
two questions, and `RegisterSummary.js` is deleted. The range picker keeps its
behaviour (it cannot be entered backwards or empty) in the app's own inputs,
each labelled over its box. The table is a plain `<table>` in the app's cell
classes, each tank in a panel under its fuel's quiet band.

What rendering caught on the way:

- **Pinned at every width, the running block covered the date on a phone.**
  Four pinned columns need about 28rem and a phone's panel has 20 to 23rem.
  The old table already overlapped below 400px, and the new look's page margin
  took the last of the room at 400. The right-hand block now pins only once
  its panel is 40rem wide (`.pinned-right-roomy`); below that it scrolls with
  the middle, the date stays pinned and prints "01 Sep", and the bottom line of
  the running block is on the fuel card at the top anyway.
- **Its offset had to become a custom property.** An inline `right` applies at
  every width, and a header cell is already sticky for the vertical pin, so on
  a phone the three headings stuck to the right edge while their columns
  scrolled away. `--pin-right` is read only inside the container query.
- **The two header rows slid over each other** when the table scrolled
  vertically, because both stuck at `top: 0`. The group row is a fixed 36px and
  the column row sticks at 36px.
- **A run of days with no dip printed "0 L" on the fuel card**, the running
  gain/loss treating undipped days as nothing, which reads as "measured, and
  exact". It says "No dip was taken on these days" now. The table's own empty
  cells say "No dip" and leave the gain/loss blank, where they were dashes.
- **"A loss of 0.35% of what was sold" broke inside its pill** on a phone and
  would not fit a 320px card on one line. The pill is the arrow and "0.35% of
  what was sold", on one line; the sign is on the figure beside it.
- **"the stock soldover these days".** An `&rsquo;` further along the same run
  of JSX text made the compiler trim the space after `</span>`. The apostrophe
  is typed as itself; `docs/UI_CONVENTIONS.md` has the rule.
- The summary row's dates read "01 to 26 Sep" (the month dropped on a phone),
  where the two days had a dash between them.

Verified from fixtures (26 days of two tanks with three deliveries each, days
without a dip, a delivery-driven stock-bought line, and variants for a loss, an
empty range, a fuel never dipped, a single day and a tank renamed "Tank 2") at
1600 to 320, the table scrolled to its middle and its end at 1024 with the
sidebar, 768 and 360. Clean apart from the top bar's name at 320.

### Activity

`ActivityView`, the page reduced to the role check and the three queries. The
person filter is the Dashboard's segmented control under a heading that says
whose entries are showing; the log is a panel with sentence-case headings; the
badge reads Created, Changed or Deleted.

**The log's own sentences carried em dashes, and the database wrote them.** The
activity trigger (migration 035 and every redefinition since) stores a spaced
em dash between a name and its figure, "Unit 1 Nozzle A" then "1,617.37 L",
and every line already in the table has one. Rewriting the SQL would have
changed only the lines still to come, and it would have been a migration on
the live database for a change of punctuation. So `withoutDashes()` in
`format-helpers.js` cleans them where they are read: the middle dot in the
activity table, and a colon in every action result (`ok()` and `fail()` in
`actions.js`, which also carry Postgres's own refusals word for word; one of
those, the safe going below zero, has an em dash) and in the two download
errors that come back through the URL. Nothing in Supabase changed.

**What rendering caught:** a full staff name made the filter wider than a
320px phone and pushed the page sideways; a name now wraps inside its choice.
And the timestamps said "25 Sept 2026", because en-GB's short month in current
ICU is "Sept", which differed from every other date in the app and ran out of
its column at 16px. `formatDateTime` now takes its date from `formatDate` and
only the time of day from Intl.

**Also:** `<Pager>` is 16px on every paged table, and the clear-out dialog's
hints are the new look's callouts at 14px, where they were 12px.

Verified from fixtures (seven entries written the way the trigger writes them,
em dashes included, a backdated payment, an edit with five changed fields, a
three-person filter with a long name) at 1600 to 320, plus the empty, single
login and filtered states and the clear-out dialog at 1366 and 360. The page's
HTML carries no em dash.

### Settings and All fuel rates

`SettingsView` and `FuelPricesView`, each page reduced to its role check and
queries. The rate cards keep their loud fuel fill as panels, the tanks are the
Dashboard's tank card (gauge, litres, percent, capacity, last dip) with Edit in
the band, each unit is headed by its fuel's quiet band, and the backup and
reset panels say what they do in 16px where they used 12px. Every dialog on
the page (nozzle wiring, replace unit, edit tank, set a rate, remove a rate,
empty everything) pads 20px, uses the new callouts, and lost its em dashes; a
missing tank or a half-typed date reads in words ("No tank", "the date
above"). The rate choices in Set a new rate list diesel first and show each
current rate to the paisa ("Rs 283.4" had read as a different price).

**What rendering caught:** the rate figure went to 48px once its card passed
16rem, which a 360px phone's card does, and "Rs 283.45 / L" ran out of it. It
now steps 30, 36 and 48px at 20 and 28rem of card.

**Also:** the wiring and replace-unit tables named their inputs with
`sr-only` labels in body cells, the pattern that once widened a whole page on
a phone; they use `aria-label` now. And `ConfirmAction`, the dialog behind
every delete in the app, took the same padding, rule and error box as the
other dialogs.

Verified from fixtures (two tanks, three live units and one replaced, one unit
re-piped to the other fuel, six recent rates) at 1600 to 320 and the three
dialogs opened at 1366 and 360. A missing rate, no rates, a tank never dipped,
a backup error and the reset panel were run through the render check at 1366
and 360 (clean) but not looked at screen by screen.

### Your account and the Guide

`AccountView` and `GuideView`, each page reduced to its role check (and, for
the guide, its language).

**Account.** Your own details and the password form under "You", the staff
logins under their own heading, side by side once the page is wide enough.
Rendering showed the Active / Disabled switch as a solid green button in both
states: it was a `SubmitButton`, and the Material UI primary fill won over the
pill's own colours, so a login that could not sign in looked exactly like one
that could. It is a native button now, pale green or grey with the word in
it, keeping the pending guard through `useFormStatus`. A long email broke off
its last letter onto a line of its own; it breaks after the "@" instead. The
closed password form could still be reached with Tab while invisible; it is
`inert` until opened. Names wrap rather than truncate, the delete is the trash
button, and every size on the page is at least 14px.

**Guide.** Every section under a `SectionHeader`, the stages and section map
as panels, tips and warnings as the new callouts. The page is read in Urdu
too, so the shared new-look pieces were checked right to left: `TitleHeader`
indented its description with a physical left padding and now uses the logical
one. The stage arrow pointed up in Urdu on a phone (a column reads top to
bottom in both languages); it points down now. The stages switch to a row by
the section's width rather than the window's.

**Em dashes.** The guide's text had 36 lines with em dashes. The English ones
were rewritten sentence by sentence (a colon, a comma, brackets or a full
stop, whichever the sentence wanted). In Urdu a single dash became the Urdu
comma and a pair around an aside became brackets. The roles table's "no" was
a dash and is a cross.

Verified from fixtures (an owner, a second owner, two staff with one disabled
and one long name, a long email) at 1600 to 320 for Account, with the staff
view, both dialogs and the open password form; and the guide in English at
1600 to 320 and in Urdu at 1366 to 320. Neither guide page's HTML carries an
em dash.

### The sweep: em dashes, the old look's leftovers, and the docs

With every page moved, a pass over the whole app.

**No em dash is left in `app/`.** Twenty-odd were words a person reads: action
messages (a nozzle with no label, a loose-oil pour too small to record, the
activity clear-out), the Stock page's "Tanks" heading and its dip-time choices
("Morning, before the pumps opened"), the dip warnings, the reading-chain
warnings, the Readings gap notice, the Dashboard's credit pill and oil line,
a treasury reason's hint, and the Excel workbook's "Total owned" row. Each was
reworded for its sentence rather than swapped for one character. The rest were
code comments, which now use a spaced hyphen like the rest of this codebase's
comments. The PDF statement's dash-folding regex spells the characters as
escapes. The Excel template workbook had none. What the database writes still
carries them and is cleaned on the way to the screen (`withoutDashes()`, see
Activity above).

**A dash is no longer an empty value anywhere.** The last one was a saved
reading's "On credit" with no credit, which now reads "Rs 0" in ink-600 (the
tone it used was ink-500, fine for a dash, below the floor for a figure).

**The old look's pieces are deleted**, each checked to have no importer first:
`StatTile` / `StatGrid` (`AdminStats.js`), `PageHeader`, `DateNav`, the three
old charts (`SalesTrendChart`, `CashCreditChart`, `LubricantTrendChart`) and
their `ChartTooltip`, `TrendRange` (its window values and `trendDaysFrom` moved
into `TrendWindow.js`), and `RegisterSummary` earlier. From `globals.css`:
`.card`, `.unit-card`, `.rate-card`, `.section-heading` and `.figure-label`,
each replaced by a short note saying what took its place. `.figure-value`
stays, for the Readings nozzle rows. The Readings clear-day dialog took the
new callouts, the last 12px sentences in a dialog.

**Docs.** CLAUDE.md's "shared pieces" now lists the new look's (with the
no-em-dash rule beside it), `docs/UI_CONVENTIONS.md` opens by saying every page
wears the new look and ends with "Building a page in it" where "Moving another
page over" was, and comments that still called the deleted components live
were corrected.

**Verified:** `next build` passes; the Dashboard, Stock (including a tank over
capacity) and Readings (including a part-entered day) re-rendered from
fixtures at 1366, 1024, 400 and 320, clean apart from screen-reader text, and
their HTML carries no em dash. The Dashboard's "over half" credit pill was not
rendered (no fixture puts credit over half); it is a one-line wording change.

**For the offline (Electron) build**, which tracks this repo: this whole round
is UI only, with no migration. Port `app/_components/` (new folders under
`admin/` for each page's view), `app/_styles/globals.css`,
`app/_lib/format-helpers.js` (`withoutDashes`, `nonBreakingHyphens`),
`app/_lib/date-helpers.js` (`formatDateTime`), `app/_lib/actions.js` (`ok` /
`fail`), `app/_lib/guide-content.js`, the `app/admin/**/page.js` and
`loading.js` files, and delete the files listed above.

## Expenses: a month where a category only got money back

Reported from the live app as a console error on Expenses: *MUI: the value
props in LinearProgress should be ... min <= value <= max. Received value=-1.*

**The cause.** The breakdown ("Where it went") nets each category's rows, so a
recovery (migration 053: a repayment is a negative row in the same category)
cancels against what was spent. That was designed and tested with the bill
and its repayments in the same month. When the repayment lands in a LATER
month than the bill, that month holds only the repayment, the category nets
negative, and its share of the month came out negative: MUI refused the bar
(the error), and the row read as a negative amount. And because the shares
were taken of the month's net total, the categories that did cost money could
add up to more than 100%.

**The fix.** A negative category is listed apart, under "More came back than
was spent this month", as "Rs 3,500 back" in green with the arrow in, and no
bar. The shares are a percentage of what the money-costing categories add up
to, so they add up to 100%, and "The biggest is X% of the month" uses the same
base. The bar value is clamped to 0-100 whatever it is handed. Nothing changed
in the data or the Spent and Recovered cards, which were right.

Reproduced first: the old code with a fixture month holding an August bill's
repayment logged the same MUI error ("value=-3"); the fix logs nothing. Checked
at 1366, 400 and 320, including a month whose only rows are repayments.

## A main bank account (migration 065)

The owner asked for the money in / money out form on Banking to start on his
main bank account. It started on whichever account was added first (the order
`getBankAccounts()` reads them in), which on this pump is not the one the
day's cash goes into, so every deposit began by changing the account.

Nothing recorded which account is the main one, so there were three ways to
know it: let him mark it, guess it from the busiest account, or remember the
last one used on each device. He chose to mark it.

**Migration 065** adds `bank_accounts.is_main`, a unique partial index so the
database refuses a second main account, `is_main` as the last column of
`bank_account_balances`, and `set_main_bank_account()`. On Banking the main
account wears a "Main account" badge and every other account offers "Make
this the main account"; the form starts on the main one, follows it at once
when it changes, and returns to it after each save. With no account marked
(including before the migration is applied) it starts on the first account
added, exactly as before, and the button explains that the migration is
missing if pressed.

Two things in the migration are there because of what testing showed:

- **The column is nullable.** `restore_everything()` (051) writes every column
  of a table by name, and a backup taken before 065 has no `is_main` in its
  rows. With NOT NULL, restoring such a file failed on the first account
  ("null value in column is_main violates not-null constraint"), so every
  existing backup would have become unrestorable. Null reads as not main.
- **Clearing the old main comes before setting the new one, in two
  statements.** A unique index is checked row by row as an UPDATE runs, so a
  single statement could meet the new `true` before the old one was cleared
  and be refused depending on row order.

**Tested against a local Postgres 16** with a small Supabase shim and all 64
earlier migrations applied, then 065: marking one account, switching to the
other, marking the same one again (no change, no log line), a second main
written directly (refused by the index), a staff login (refused, owner only),
an unknown account (refused in words), the activity log (one "changed" line
per account actually changed), restoring accounts from rows taken before 065
the way `restore_everything()` does (restores, reads as not main), the same
restore against a NOT NULL column (fails, which is why it is not), the month
export that reads the same view (runs), and applying 065 twice (no error, the
marked account kept). The live database was not touched.

For the offline build: 065 is plain SQL; take it with the action, the button
and the form change.

## Expenses: "Recovered this month", not "More came back than was spent"

Reported from the live September page, with a screenshot: the caption over
the recovered rows was wrong, because the month spent far more than came back.

**The report was right.** The words were meant of each row under them: in each
of those categories, more came back than went out. But a heading is read as a
claim about the page, and on the page the month had Rs 303,549 spent and
Rs 29,000 recovered. The caption said the opposite of the truth.

**Why every repayment landed under it.** The live month, queried read-only,
holds five repayments, each typed under a name of its own ("Electricity bill
recovery from Tyre shop" and four more like it), while the bill itself is
"Electricity Sep 26". So none of them nets against the bill: each is a category
holding nothing but a repayment, and each comes out negative. August's three
repayments were typed under "Electricity", the bill's own name, and netted into
it as 053 designed. Both are honest ways to enter them, and the app does not
guess which bill a repayment belongs to.

**The fix.** The caption reads "Recovered this month": the word on the
Recovered button, the card above and the badge in the table. The rows are
listed biggest first, like the list above them. They were smallest first,
because the whole breakdown is sorted from the most spent down to the most
negative. In September the list adds up to the Recovered card, Rs 29,000. A
category that had a payment as well as more back shows what is left after the
payment, and the table lists both rows. The rule this leaves is in
`docs/UI_CONVENTIONS.md` and the skill: a caption over part of a list names
the list, it does not compare.

Checked with a fixture of the live month's categories and amounts at 1366,
1024, 400, 360 and 320, and with a month where one category had a payment and
more back: no console errors, and no figure wraps.

## Migration 065 applied to the live database

Through the Supabase connector, on 26 Sep 2026, once applying migrations was
allowed for this session on one condition: this is real client data, and
nothing in it may be destroyed.

**The project was matched by its data.** The connected account holds three
projects, and this checkout has no `.env.local` to read a ref from (the rule
the 053 entry leaves). The one named for the pump had September 2026 expenses of
exactly the figures on the owner's screenshot: Rs 303,549 net, Rs 29,000
recovered in 5 repayments. Only the database the app reads from could do that.
Its migration history ended at 064.

**Checked before applying:** the live `bank_account_balances` had exactly the
11 columns and the body 065 assumes, with `security_invoker` on and nothing
depending on it. `set_main_bank_account` and the index did not exist yet, and
`is_super_admin()` did.

**Nothing in the books changed.** Both accounts' rows in the view (the 11
original columns) and all 83 bank transactions hash identically before and
after (md5 over every row), and the total balance is Rs 5,329,891 both times.
No account is main until the owner marks one: `is_main` reads false on both
accounts, none null. `authenticated` can call the new function and `anon`
cannot. With nobody signed in, the function refused with "Only the owner can
choose the main bank account." That call ran inside a block that rolls itself
back, so it could not have written even if it had been allowed, and afterwards
still no account was main.

## `main` brought up to date, then cards in a row made one height

**`main` first, as asked.** `main` was fast-forwarded to this branch (59788fa
to 55e1ff4, 18 commits: every remaining page in the new look, the em dash
sweep, the Expenses fixes and the main bank account). The only migration among
them, 065, was already applied to the live database, so nothing on `main`
waits on the database.

**The report.** Three screenshots: Banking's two accounts, the Dashboard's
lubricant panels, and Treasury's "Where it came from" beside "Where it went".
Each had a shorter card beside a taller one, with the space under the shorter
one circled. Cards of different heights in a row look wrong.

**They were uneven on purpose.** `items-start` was this app's rule for rows of
summary cards (the old "a short card stays short" section of
`docs/UI_CONVENTIONS.md`), reasoned from the customer page, where a one-line
fuel band stretched beside the balance card left blank card that read as a
figure that had not loaded. In the new look, white cards on a grey page, the
ragged row read as the broken thing instead. The section is rewritten as
"Cards in a row are one height", with the old reasoning kept in it.

**What changed.** Every row of peer cards takes the grid's own stretch, and
each card decides where its spare height goes:

- **Banking.** The accounts are one height. "Main account" moved from under
  the account's name to the card's foot, the slot where every other account
  has "Make this the main account", so the headers are the same two lines and
  the balances, the paid in / paid out tiles and the last lines all sit level.
- **Dashboard.** The fuel cards (the spare height goes to "Sold on", under "No
  diesel readings entered for this day", so the tanks and the month stay level)
  and the lubricant panels.
- **Treasury.** The two breakdowns.
- **A customer's page.** The balance and the fuel taken: the balance's two
  tiles drop to its foot, and the fuel bands grow to fill their panel.
- **Settings.** The tanks ("Last dipped" at the foot) and the dispensing units
  (Replace at the foot).
- **Stock.** The two tanks, with a recorded dip at the foot of its card.
- **The loading placeholders** for a customer's page and Treasury, which drew
  the old uneven shapes.

**Left alone on purpose:** a panel beside something that grows without limit.
Expenses' breakdown beside its table, Banking's form beside the transactions,
and Your account beside the staff list would each become as tall as a long
table. Company Assets was already one height (`h-full` cards).

**Three things found on the way.**

- **`min-h` counted the padding.** The Banking footer's `min-h-10` sat on the
  element carrying the rule's `pt-4`, so under `border-box` it measured the
  padding too and did nothing: the badge row was 45px, the button row 54px,
  and the rules above them 9px apart. It moved to an inner element.
- **A sentence beside the badge** ("New transactions start on this account")
  wrapped to a second line at the narrow end of two columns, which would have
  put the rows out of line again. The badge stands alone.
- **The Stock page's in-between moment.** While one tank's dip is recorded and
  the other still shows its form (the minutes between the two dips), the
  recorded card is as tall as the form, and the gap sits above its recorded
  dip. Once both are recorded, which is how the page usually stands, the two
  recorded dips are level. A gap at the foot instead was the other choice; it
  would leave the resting state's two dips out of line.

**Checked** by measuring each card in each row as well as looking. Before:
Banking 280/331px, Treasury 122/170, the customer's panels 252/174, the
lubricants 186/334 on a day with nothing sold, the fuel cards 436/530 with one
fuel entered, Stock 453/874, Settings units 225/285. After: equal in every row
at 1366, 1024 and 900 wherever two columns fit. Below that the cards stack and
their heights are their own. The clipping report on all six pages at 1366,
1024, 400, 360 and 320 flags only screen-reader labels and the top bar's
deliberate truncation. No console errors.

For the offline build: markup only, in `BankingView.js`,
`MakeMainAccountButton.js`, `DashboardView.js`, `FuelCard.js`,
`LubricantPanels.js`, `TreasuryView.js`, `CustomerView.js`, `StockView.js`,
`StockCheckForm.js`, `SettingsView.js`, `TankForm.js` and the two
`loading.js` files.

## A backdated price re-prices its days (migration 066)

**The report, 28 Sep 2026:** _"the fuel rate for 27-09-2026 for diesel is
412.25 and when multiplied by total sale for nozzle A ... it comes to be
97,373.45 but on the nozzle it is shown 98221."_

**What the rows said.** Unit 1 Nozzle A, 27 Sep: 236.20 L at **Rs 415.84**,
not 412.25. Every reading keeps a copy of the rate it was saved at
(`rate_per_litre`), and the readings for 27 Sep were saved at 09:16-09:19 on
28 Sep, while the rates for 26 and 27 Sep (diesel 412.25, petrol 395.02) were
set at 10:01-10:08. The same had happened to 26 Sep's readings the morning
before. Twelve readings, both fuels, both days: diesel over by Rs 3,833.73,
petrol under by Rs 7,394.14, the books **Rs 3,560.41 short** in all.

**Not the first time.** Checking every reading against the price table found
the same order of events on 14 Aug (readings 10:47, price 10:57), 12 Sep
(09:28, 09:41) and 25 Aug (saved at 374.90, a rate no longer in the table:
most likely mistyped, removed and set again as 374.30, which never reached
the readings either). This pump's prices move most days and the owner sets
the new one when he gets to it, so the two crossing is ordinary, not careless.

**Why the copy stays.** It is what stops a price set today rewriting last
week's takings, and a price dated today still changes nothing already saved.

**What changed.**

- **`set_fuel_price()` and `remove_fuel_price()`** replace the plain insert and
  delete. Each saves or removes the price and then calls
  `reprice_readings_for_span()`, in one transaction. A price governs its date
  up to the next price's date, and only readings of that fuel in that span
  whose rate is not the rate now in force for their day are touched. The
  update writes `rate_per_litre` and `cash_amount` together (cash = sale -
  credit, 052's derivation), so the split constraint holds by construction;
  credit is the slips' and does not move. If the slips would come to more
  than a re-priced sale, it is refused with a sentence naming the day and the
  nozzle, and the price is not saved either. Owner only, security definer like
  `clear_day()`.
- **The answer says what moved**: "Diesel rate set to Rs 412.25 per litre from
  26 Sep 2026. 2 readings already saved for 26 Sep 2026 were re-priced from Rs
  415.84 to Rs 412.25: diesel sales on that day went from Rs 266,491 to Rs
  264,190." The Settings form and the remove confirmation say it before saving.
- **Readings warns before the mistake**, while a fuel with a nozzle still to
  enter is on a rate set for an earlier day: "Has the price changed since? Set
  the new rate under Settings before entering. Diesel is on Rs 415.84, the rate
  set for 25 Sep 2026." `getRatesInForce()` uses the same rule as
  `current_fuel_rate()`, so the notice and the saved rate cannot disagree.
- **The saved-reading dialog shows the rate**, laid out as the sum: Sold beside
  Rate a litre, Total under both. Its absence is why 98,221 could not be
  explained from the screen.

**The two days, put right through the same function**, as the owner, after the
migration: diesel and petrol for 26 and 27 Sep, twelve readings. Unit 1
Nozzle A on 27 Sep is now Rs 97,373.45. Hashed before and after: the other 336
readings and every price are byte-identical, total sales moved by exactly
Rs 3,560.41, and the activity log holds the twelve changes under the owner's
name.

**Then the three older days, at the owner's word ("yes fix the three older
days too")**, through the same function, dry-run first: petrol and diesel on
14 Aug, diesel on 25 Aug, petrol on 12 Sep, twelve readings.

| Day | Fuel | Saved at | Now | Sales before | Sales after |
|---|---|---|---|---|---|
| 14 Aug | petrol | 329.53 | 329.04 | 724,606.81 | 723,529.34 |
| 14 Aug | diesel | 385.80 | 387.50 | 71,091.37 | 71,404.63 |
| 25 Aug | diesel | 374.90 | 374.30 | 203,102.07 | 202,777.03 |
| 12 Sep | petrol | 374.43 | 379.45 | 555,508.09 | 562,955.82 |

Total sales moved by +Rs 6,358.48. Three of those readings carry credit
(Rs 40,725 in all), which did not move: the cash side took the change, so no
customer's balance changed. Every other reading and every price hashed the
same before and after, and **no reading in the books now disagrees with the
price table.** August's totals changed by Rs -1,089.25 and September's by
+Rs 7,447.73 (plus 26-27 Sep above), so a report for either month
downloaded before 28 Sep 2026 is out of date.

**Verified.** Dry-run against the live database inside a transaction that
raised at the end, as the owner's login: the re-price of 26 Sep (figures to
the paisa as computed by hand), a second call changing nothing, a staff or
signed-out call refused, a rate that would put credit above the sale refused
(24 Aug, the price rolled back with it), a price for a day with no readings
re-pricing nothing, and removing 27 Sep's diesel price re-pricing 27 Sep onto
26 Sep's. Hashes unchanged after the dry runs and after applying the
migration. Readings rendered at 1366 / 1024 / 400 / 360 / 320 with the notice
and the dialog, nothing clipped, no console errors; `npm run build` passes.

**For the offline build:** 066 is plain PL/pgSQL; take it with the two actions
in `actions.js`, `getRatesInForce()`, and the Readings and Settings changes.
It adds no column, so the backup needs nothing new.

## The way back is a button

_"make this back to customers button and make it more prominent"_, with a
screenshot of a customer's page and the small green "All customers" link above
the name circled.

The link was `TitleHeader`'s `back`: 16px green text with a chevron, which on
a tablet reads as a caption, not as the way out of the page. It is now a
`<Button>` (Material UI, outlined, the brand green, a 2px border at full
strength rather than MUI's half-alpha default, bold, `size="large"`), with the
arrow, and it shows the pending state while the next page loads.

**Worded as an instruction.** "All customers" named the destination; "Back to
customers" says what pressing it does. The other three subpages that pass
`back` were reworded the same way so every way back reads alike: "Back to
settings" (the rate history), "Back to reports" (the daily sales page and the
register).

**Blast radius:** `TitleHeader` is on every page, but only those four pass
`back`. Rendered with the customer's header and its four action buttons, and a
header with no actions, at 1366, 1024, 400 and 360: nothing clips, and the
outlined button sits above the title without competing with the filled
"Record a payment". `npm run build` passes.

## Suppliers, and what the pump owes them (migration 067)

**The ask, a WhatsApp voice note from the owner in Urdu (28 Sep 2026),
transcribed with Whisper:** _"add a sheet for the suppliers' accounts. We have
three or four suppliers. Their ledger is a little different from the
customers', because the customers are our customers and with these, we are
their customer. When their oil came, I wrote the invoice, then the litres,
then the rate per litre, then the money we paid them, then the balance."_ Then
from the developer: placeholder suppliers at zero, editable; the owner pays
both in cash and by bank transfer; fuel and lubricants both; and room for a
discount from the supplier's side.

**What was there:** every delivery carried a free-text `supplier_name` and a
paid / pending flag. No part payments, no one payment against three invoices,
no discount, and no running figure of what is owed to whom.

**What 067 adds.**

- **`suppliers`** (name, phone, note; retired, never deleted once it has
  history) and **`supplier_ledger_entries`**, append-only like the customer
  ledger: `direction` is `owe_more` or `owe_less`, named for what it does to
  the pump's debt because debit and credit point the other way here from the
  customer ledger two pages over. Kinds: purchase, payment, discount,
  adjustment, reversal.
- **A delivery posts itself.** Both purchase tables gain a nullable
  `supplier_id`; the Purchases forms choose the supplier from the list instead
  of typing a name (`SupplierSelect`). Saving posts the invoice amount, with
  the invoice number and litres; deleting the delivery posts a reversal. The
  reversal trigger runs BEFORE the delete: after it, the foreign key's own
  ON DELETE SET NULL (whose trigger sorts ahead by name) had already cleared
  the link and the entry to reverse could not be found. A delivery on an
  account cannot have its amount, date, litres or supplier changed; it is
  deleted and recorded again, as before. Existing deliveries have no supplier
  and post nothing, so every account starts at zero.
- **A payment moves the money it describes**: cash is also a Treasury 'out'
  under the existing 'supplier' category, a transfer is also a bank payment
  ("Supplier payment") from the chosen account, in one transaction, so the
  safe's and the bank's own rules refuse what could not really have been paid.
  Cancelling a payment takes its safe or bank row back out; if that row is
  gone (the bank keeps 60 rows per account), the money is put back as a new
  entry instead.
- **Discounts** (always owe less) and **adjustments** (either way, a reason
  required: the opening balance from the old register is the usual one). Any
  payment, discount or adjustment can be cancelled with a reversal; a
  delivery's entry is cancelled by deleting the delivery.
- **Owner only**: the names are readable by staff (they record deliveries),
  the accounts and every write are the owner's, like Banking and Treasury.
- **Backup, reset, activity log.** Both tables are in `backup_table_order()`;
  `suppliers` is also in `backup_seeded_tables()` because the four placeholder
  names make a freshly migrated project non-empty. `reset_all_data()` empties
  the supplier ledger after the purchases and keeps the suppliers. Both tables
  are logged by `trg_write_supplier_activity()`, a function of their own, so
  `trg_write_activity()` and the eighteen tables it describes are untouched; a
  delivery's automatic entry is not logged twice.
- **Reads**: `get_supplier_summaries()` (balance, bought, paid, discounts, net
  of cancellations) and `get_supplier_ledger_page()` (the running balance and
  the rate per litre summed and divided in Postgres, as 064 does for
  customers).

**The pages.** `/admin/suppliers` lists every supplier with what is bought,
paid and owed, and a retired list; `/admin/suppliers/[id]` is the account,
laid out like a customer's: the balance, then the ledger with the invoice,
litres and rate under each delivery, "Bill" and "Paid or taken off" columns,
and "Owed after". A balance below zero says "in your favour" in words. The one
primary button is "Record a payment", which asks "Paid from": cash from the
safe (showing what the safe holds) or a bank transfer (showing what the chosen
account holds). Retiring is a text button at the foot of the supplier's page:
first built as ConfirmAction's red icon on each row of the list, where a red
cross beside a company's name read as "delete".

**Tested against a local Postgres 16** with a Supabase shim and all 66 earlier
migrations, seeded with an owner, a staff login, a bank account and the 36
treasury rows 045 seeds; then 067: staff can read the names but not the
accounts, cannot pay or add; deliveries post with invoice and litres; a cash
payment above the safe and a transfer above the account are refused in the
existing pages' own words; discount, opening balance and a reasonless
adjustment (refused); cancellations put the cash back in the safe and take the
bank row off, and a second cancellation, a delivery's entry and a cancellation
itself are refused; deleting a delivery reverses it; editing a linked delivery
is refused and its payment status is not; the ledger refuses edits and deletes
even from a superuser; running balances correct across pages; activity lines
readable and none for automatic entries. **Backup round trip**: exported,
loaded into a fresh project (its four seeded suppliers cleared first) with
byte-identical suppliers, ledger and balances and nothing posted twice; a
backup taken before 067 restores too (its deliveries come back with no
supplier, and the restored project has no suppliers until the owner adds
them). A bank payment whose row the 60-row trim removed is refunded as a new
deposit when cancelled. The reset empties the ledger and keeps the suppliers.
**Applied to the live database on 28 Sep 2026**, at the owner's go-ahead, after
the branch was run locally against it and the Suppliers page failed with "Could
not find the function public.get_supplier_summaries" (the code was ahead of the
database). Hashed before and after: fuel deliveries (compared without the new
empty column), bank transactions, treasury, readings and the customer ledger
all byte-identical; no delivery linked to a supplier; the four placeholder
suppliers present at zero; `backup_tables_missing()` empty; the four new
activity lines are the four suppliers being created. Then merged to `main`.

**The placeholders were then removed from the live books** at the owner's
request ("just make it empty for now"), before the real supplier list is
decided: the live books name about twenty spellings for perhaps eight
companies (New Chaudhry, Adnan Five Star GO, PSO Zamzam, PSO Raja...), and
"Measure check" / "Unit check" are Rs 1 entries for fuel returned to the tank
after a measure, not suppliers. Deleted as the owner, with nothing linked to
them; four "deleted" lines in the activity log. While the list is empty the
purchase forms cannot save a delivery (the supplier is required), so a
supplier has to be added before its first delivery. A freshly migrated project
still gets the four placeholders from 067.

Rendered from the functions' real output at 1366 / 1024 / 400 / 360 / 320:
two fixes came out of it, a bank account's balance cut off inside a native
select on a phone (now a line under it) and "Rs" breaking from its figure in
the dialog subtitle at 360px (now kept together).

**Not done, and worth deciding:** the Purchases forms still ask "Payment:
paid / not paid yet". A delivery on a supplier's account is settled by the
payments on that account, so the flag now says the same thing a second time
and can disagree with it. Left in place until the owner says whether to drop
it.

For the offline build: 067 is plain PL/pgSQL; take it with the Suppliers
pages, `SupplierSelect` on both purchase forms, the actions and the
data-service reads.

### The supplier account says Payable and Advance

The owner circled the supplier table's headers ("Paid or taken off", "Owed
after") and the "Rs ... in your favour" balances as unclear. They now read as a
supplier statement: **Purchases**, **Payments & credits**, **Balance**, with
each balance followed by its side, **Payable** (red), **Advance** (green) or
**Settled**. The balance card says "Payable to supplier" or "Advance with
supplier", the suppliers list's columns are Purchases / Payments / Balance, and
"The account" explains the two words in one sentence. The badges for a
delivery and a payment now read "Purchase" and "Payment by bank" / "Payment in
cash", to match the column they fill. Wording only: no figure, query or
migration changed.

Prompted by the first real account: "Gas and Oil Mubeen PS 0001000302", an
advance of Rs 1,915,159 entered as two adjustments (25 Sep Rs 1,568,659 and
28 Sep Rs 346,500). Checked against the live books before answering: both are
already on Banking as HBL payments on the same dates, so an adjustment (which
touches no bank or safe) was the right entry and "Record a payment" would have
taken the money out of the bank a second time. The one thing it leaves odd is
the tiles: adjustments are not counted as Payments, so the card shows an
advance with Payments Rs 0.

**Urdu on the supplier forms**, at the owner's request so his father reads
them at a glance: نقد / بینک on the payment's "Paid from" cards, and جمع /
بنام on the adjustment's direction. On a supplier account جمع is "owes the
supplier more" and بنام "owes the supplier less", the reverse of the customer
forms, because that is how a supplier's khata is written.

## Stock value at month end, fuel by fuel

The owner's father found the app's September 2026 profit different from the
accountant's, and asked where the closing stock's value was. It was nowhere
per fuel: the profit's opening and closing stock appeared only as one combined
sum inside the "How profit is worked out" sentence on Reports, never as
"749 L of diesel at Rs 392.89 = Rs 294,276".

**Migration 068, `get_month_end_stock(year, month)`**, super admin only, reads
and writes nothing new. Per fuel, at the close of the month's last day and at
the close of the day before it began: litres (`tank_stock_on_hand`), value
(`tank_stock_value`, exactly what `cost_of_goods_sold` subtracts), the cost
rate (value / litres), the pump price in force that day, the value at that
price, and the gap between the two values. Totals for each side come back from
Postgres too (`stock_totals`), including `stock_value_at()` itself, so the
fuels plus the lubricants add up on screen to the figure in the profit working.

Checked against the live books in a transaction that was rolled back: opening
Rs 605,388.60 and closing Rs 2,098,692.00, the same to the paisa as
`get_monthly_report(2026, 9)`.

| September 2026 | Litres | Cost a litre | Value at cost | Pump price 30 Sep | Value at pump price |
|---|---|---|---|---|---|
| Diesel | 749 L | Rs 392.89 | Rs 294,276 | Rs 405.96 | Rs 304,064 |
| Petrol | 4,699 L | Rs 384.00 | Rs 1,804,416 | Rs 391.26 | Rs 1,838,531 |

**Where it shows.** The Dashboard gains "Stock carried into October": the
month before the one on screen, its closing stock and so this month's opening
stock. Reports gains "Opening and closing stock" for the chosen month, between
the profit and the closing-litres table. Both use `MonthEndStock`, a table at
44rem of card and above, one block per fuel below it (a sideways table on a
phone hid the value column, the one figure the panel exists for). A failure to
load is a Notice in the section, never the whole page.

**The likely cause of the disagreement, said on the page.** The app carries
stock at what it cost; an accountant often values closing stock at the pump
price. For September the fuel at the pump price is Rs 43,903 more than at
cost at the close, and Rs 15,703 more at the opening, so a profit worked that
way comes out Rs 28,200 higher. The panel says the gap in a sentence under each
table, and which way it moves the profit (a higher closing stock raises it, a
higher opening stock lowers it).

**Noticed and not changed:** the "Measure check" deliveries (fuel poured back
after a measure, entered at Rs 1) are deliveries to `tank_stock_value`, so the
newest litres in a tank can be carried at a few paisa. Diesel's 749 L at
30 Sep includes 4 L at Rs 0.25, which is why its cost rate is Rs 392.89 and
not the Rs 395 of the load it came from (about Rs 1,580). Changing that changes
past profits, so it is the owner's decision.

For the offline build: take 068 and `MonthEndStock` with its two callers.

**Applied to the live database on 1 Oct 2026** (project `cnvqisgzazyesihixwqu`)
at the owner's go-ahead. The nine money and stock tables were fingerprinted
before and after and hash the same; as the owner, September returns the
figures above to the paisa; a staff login is refused.

**A month still running has no closing stock** (reported the same day). On
1 Oct, October's Reports page said "Closing stock (close of 31 Oct 2026)" over
the morning's stock, 2,749 L of diesel including that day's 2,000 L delivery.
The figures were right: nothing is entered past today, so the close of the
31st is what the tanks hold now, and the profit for the month so far uses the
same value. The words were wrong. While the month's last day is after today,
Reports now says **"Stock so far (as entered up to <today>; the month closes
on <last day>)"**, the tank table below becomes "Stock so far this month" with
a "Litres now" column, the profit working says "still there now", and the
gap sentence speaks of "the profit so far". A finished month reads as before.

## Stock at the lower of cost and the pump price

Asked after the month-end table went up: which rate should profit use? The
answer is the accounting rule, IAS 2, and for tax section 35 of the Income Tax
Ordinance 2001: stock-in-trade at the **lower of cost and net realisable
value**. The app had the "cost" half only. The other half matters when the
price is cut below what the fuel in the tank cost, and cuts here are large and
overnight: diesel fell from Rs 399.30 to Rs 366.60 on 20 Aug 2026. On a
month's last day, with 5,000 L bought at Rs 386, that would overstate the
month's profit by Rs 97,000 and push the loss into the next.

**Migration 069.** The old `tank_stock_value()` is copied from the database's
own definition under a new name, `tank_stock_cost_value()` (renamed by string
replace on `pg_get_functiondef`, the way 049 and 059 patched, so no line can be
lost in a hand copy). `tank_stock_value()` becomes the lower of that and litres
x `fuel_rate_on()`, the pump price in force that day; with no price on record
(31 Jul) it stays at cost. Everything that values stock calls it, so
`stock_value_at`, `cost_of_goods_sold`, the monthly report, the Excel export
and the register take the rule together, and a month's closing and the next
month's opening remain one figure. The pump price stands in for net realisable
value with no cost of selling deducted; lubricants stay at cost.

**No past profit changes**, checked against the live books first: at 31 Aug
and 30 Sep the pump price was above cost for both fuels.

Tested on a fresh local database with every migration: pump above cost, value
unchanged; a cut to Rs 366.60 on the 30th, 5,000 L at Rs 386 written down to
Rs 1,833,000; the day before the cut still at cost; September's cost of goods
sold takes the Rs 97,000, and October opens on the written-down figure.

**The table** (`MonthEndStock`) now has seven columns: litres, cost a litre,
value at cost, pump price, value at pump price, and **Used in profit (the
lower of the two)** with "cost" or "pump price, below cost" under each figure.
It switches to blocks below 52rem of card. A written-down fuel gets its own
sentence ("written down by Rs 97,000, a loss taken in this month"); otherwise
the sentence explains the usual gap and that pump-price valuation would count
margin on fuel not yet sold.

**Applied to the live database on 1 Oct 2026** (project `cnvqisgzazyesihixwqu`)
at the owner's request. The monthly profit for July to October 2026, with
opening and closing stock values, is the same before and after to the paisa
(August Rs 540,765.01, September Rs 499,689.86), and September's month-end
table shows "cost" for both fuels.

## Banking keeps every entry

On 1 Oct 2026 the activity log showed "Deleted: Money out of the bank,
Rs 3,827,500 (fuel purchase, 14 Sep)" under the owner's father's name at
11:59 pm. Nobody had deleted it: his Rs 27,062 deposit was the 61st entry on
HBL Main Account 2303, and 018's trigger removed the oldest one, folding its
amount into `pruned_payments` (3,073,200 to 6,900,700) so the balance stayed
exact. The account fills 60 rows in about two and a half weeks, so September's
itemised entries were going before September's Excel had been downloaded. The
owner asked for the limit to be removed.

**Migration 070** drops the trigger and its function. The 89 entries already
removed stay removed; their amounts stay in `pruned_*`, which the balance view
still adds in, so no balance moves. Space is no concern: the whole database was
17 MB of the free tier's 500 MB, the bank table 88 kB for 83 rows.

**The Banking page pages in Postgres now** (`getBankTransactionsPage`, range +
exact count). It used to fetch every row and slice, which was fine at 60 per
account and would stop silently at PostgREST's 1,000-row ceiling without the
cap. Each account card's count comes from `bank_account_balances.kept_count`.
The notice says every entry is kept and how many were removed before 2 Oct
2026; the card says the same of its own.

**Applied to the live database on 2 Oct 2026.** The Supabase connector's
approval for a statement containing DROP was cancelled or timed out four times,
so the owner ran the two `drop` lines himself in the SQL Editor; the comments
were applied after. Checked from here: the trigger and function are gone, and
every balance is as before (HBL 2303 Rs 425,984, Limit Rs 4,812,197, Easy Paisa
Rs 19,000). One more entry was removed while waiting (a Rs 56,212 deposit
pushed it out), so 90 entries in all were removed by the old cap; their amounts
are in `pruned_*`.

## A new customer's opening balance could never be saved

Found on 3 Oct 2026 while rebuilding the database from its migrations for a
demo copy: `create_customer_with_opening('…', …, 5000, 'owes')` failed with
"column entry_type is of type ledger_entry_type but expression is of type
text". The live books held no opening-balance entry at all, which is what a
feature that has never worked looks like.

**Cause.** 034 picked the entry type with `case when … then 'debit' else
'credit' end`. Both branches are untyped literals, so Postgres types the CASE
as `text`, and there is no assignment cast from text to an enum. The function
is one transaction, so the customer was not created either: the owner saw an
error and nothing was saved. With no opening amount the insert is never
reached, which is why adding customers otherwise worked. 034 is the only
migration with this pattern.

**Migration 071** is 034's function with one cast,
`(case … end)::public.ledger_entry_type`, and the same grants restated. No row
is touched; there was nothing to repair, because the function never succeeded
with an amount. Tested on a local Postgres built from all 70 migrations: the
error reproduced exactly before 071; after it, "owes 5000.4" posts a debit of
Rs 5,000 and "in credit 1200" a credit of Rs 1,200 with the right notes and
balances, the two refusals (no direction, not logged in) still fire, `anon`
still cannot call it, and running 071 twice is harmless.

**Applied to the live database on 3 Oct 2026** (project `cnvqisgzazyesihixwqu`)
at the owner's request, through the Supabase connector. Every public table
hashed identically before and after (82 customers, 673 ledger entries
unchanged); the function carries the cast; `anon` still cannot call it and
`authenticated` can; the history's last record is `071_opening_balance_entry_type`.
A trial on live inside a transaction that was made to fail on purpose, so
nothing was kept, created a customer owing Rs 5,000 and read back a debit of
Rs 5,000 and a balance of Rs 5,000; afterwards the tables still hashed the same
and no trial customer remained.

## Stock value and cost of sales were readable without logging in

Found on 3 Oct 2026 while comparing the demo database with the live one.
`cost_of_goods_sold(date, date)`, `stock_value_at(date)` and
`lubricant_stock_value(uuid, date)` could be called with the site's public
(anon) key, the one every visitor's browser receives. They run with the owner's
rights and check nobody's role, so anyone could ask for the cost of the fuel
sold in any period and the value of the stock on any day; with sales, that is
the month's profit. Read-only: nothing could be changed through them. Seven more
internal helpers (`activity_actor`, `backup_seeded_tables`,
`backup_tables_missing`, `restore_remap_actor`, `supplier_name_or_refuse`,
`tank_stock_on_hand`, and `backup_table_order`, the last also anon) answered
any logged-in staff member.

**Cause.** 049 wrote `revoke all ... from public` meaning "nothing else can
ask"; but Supabase grants EXECUTE on every new function to `anon` and
`authenticated` by name, and those grants are not part of `public`. The rule
for future migrations: **revoke from `public, anon, authenticated`** for
anything internal, as 034 and 071 do for anon.

**Migration 072** revokes those three grants on all ten and fails if either
role can still call any of them. Nothing in the app changes: every caller is a
SECURITY DEFINER function (the reports, the export, the restore, supplier
payments, the activity-log triggers), no view or policy uses them, and the app
never calls them by name. Tested on a local Postgres with Supabase's grants
recreated: anon could read the cost of goods sold before and is refused after,
and the monthly report, month export, range and daily summaries, backup export,
new customer with opening balance, supplier entry and activity log all still
work as the logged-in owner.

**Applied to the live database on 3 Oct 2026** (project `cnvqisgzazyesihixwqu`)
at the owner's request. Every public table hashed identically before and after;
none of the ten is callable by `anon` or `authenticated`, and no SECURITY
DEFINER function without a role check is left callable by `anon`; the history's
last record is `072_close_internal_functions`. In a transaction made to fail on
purpose, as the owner the September report, month export, range and daily
summaries all ran (September profit Rs 499,689.86, as recorded under 069), and
as `anon` `cost_of_goods_sold` was refused.

# Syncing the offline (Electron) build: reference `3d696ea` -> the end of migration 072

**Who this is for.** A session working in `Ammar-Sagheer/Offline-Petrol-Pump-Manager`
(the desktop build: Electron, its own bundled Postgres, `pg` driver, `app_user`
role, no Supabase), told to sync with this repo. Written 3 Oct 2026 from both
repos side by side. The desktop build's `PROGRESS.md` records its last sync as
**"The third catch-up: reference `98712fd` -> `3d696ea`"** (24 Aug 2026), and
its migrations end at `037_clear_the_old_activity_log.sql` (= this repo's 050).

**The scope, exactly.** In this repo: `git diff 3d696ea..main`. That is 78
commits: 20 migrations (053 to 072), 51 files added, 9 deleted and 107 changed
under `app/`, `scripts/` and config, and one new dependency, `pdf-lib`. Use the
method the desktop build's `PROGRESS.md` already recommends ("Finding the sync
point mattered more than reading the diff"): for each changed file,
`git show 3d696ea:<path> | diff - <offline path>`. A file that was
byte-identical at `3d696ea` is a **verbatim copy** now; anything else has an
offline-specific reason and is merged by hand. The hand-merged files are, as
before, `app/_lib/data-service.js`, `app/_lib/actions.js` and the auth/session
pieces.

**Migration numbers do not line up.** The desktop build renumbers (its 032 is
this repo's 044, its 037 is this repo's 050). Compare by content, never by
number. New desktop migrations continue from **038**.

## 1. Database: 20 migrations, 3 to skip

Two edits apply to every migration taken, as in the earlier catch-ups:
`auth.uid()` becomes the desktop build's `current_uid()`, and grants `to
authenticated` become grants to `app_user` (`anon` does not exist there; drop
those lines).

| Here | What it is | Desktop build |
|---|---|---|
| 053 `expense_recovery_rows` | `expenses.amount` may be negative: a partial reimbursement against a bill is a second row | **Take.** Plain SQL |
| 054 `lifetime_fuel_totals` | `get_daily_summary()` gains lifetime litres per fuel | **Take, then 055.** 055 replaces 054's key; apply both, in order |
| 055 `month_to_date_fuel_totals` | ...as month-to-date litres per fuel (the Dashboard's "Total sold this month") | **Take** |
| 056 `replacing_a_damaged_unit` | Nozzles get a service window (`commissioned_on`, `retired_on`, `replaced_by`); `replace_unit()`; readings refused outside the window | **Take.** Uses `auth.uid()`: swap for the desktop build's `current_uid()`, grants to `app_user` |
| 057 `replaced_units_in_the_activity_log` | The activity line for a nozzle names its service window | **Merge by hand.** It reproduces `trg_write_activity()` whole; diff it against the desktop build's own copy (its 024 port) and carry only the nozzle branch |
| 058 `rearranging_the_forecourt` | Unit number and nozzle label become editable; positions guarded across history by a deferrable exclusion constraint | **Take.** `auth.uid()` -> `current_uid()` |
| 059 `stock_is_valued_at_what_the_tank_holds` | Profit stops charging a month-end dip's loss to the next month: valuation asks `tank_stock_on_hand()` | **Take, and check it bit.** It patches existing functions through `pg_get_functiondef()` + text replacement, so it only works if the desktop build's function bodies match this repo's text. Afterwards, `select pg_get_functiondef(...)` and confirm the new call is in |
| 060 `a_traded_nozzle_keeps_its_tank` | A nozzle that has traded can never change tank | **Take.** A generic guard |
| 061 `unit_1_changed_fuel_on_1_september` | One-off repair of THIS pump's rows | **Skip.** Data repair for the live pump; no-ops on any other database |
| 062 `august_keeps_the_numbers_august_had` | One-off repair of THIS pump's rows | **Skip.** Same |
| 063 `correcting_a_ledger_entry` | `correct_ledger_entry()`: a reversal plus a replacement, never an edit | **Take.** `auth.uid()` -> `current_uid()` |
| 064 `the_ledger_carries_its_own_balance` | Every ledger row carries `balance_after`, computed over the whole ledger, then paged | **Take** |
| 065 `a_main_bank_account` | `bank_accounts.is_main` (nullable), one main account | **Take.** Nullable on purpose for the online backup; harmless here |
| 066 `a_backdated_price_reprices_its_days` | `set_fuel_price()` / `remove_fuel_price()` re-price the readings a back-dated price covers | **Take.** `auth.uid()` -> `current_uid()` |
| 067 `suppliers_and_what_the_pump_owes_them` | `suppliers`, append-only `supplier_ledger_entries`, delivery-posting triggers, payments out of the safe or a bank | **Take, carefully.** The largest one. Adds two tables to the activity log (`trg_write_supplier_activity`) and touches `reset_all_data()`, `export_everything()`/`restore_everything()` and `backup_table_order()`. Take the activity and reset parts; the export/restore parts do not apply here (the desktop build never took 051) |
| 068 `month_end_stock_by_fuel` | `get_month_end_stock(year, month)` | **Take.** Read only |
| 069 `stock_at_lower_of_cost_or_pump_price` | Stock at the lower of cost and the pump price | **Take, and check it bit.** Patches `tank_stock_value()` through `pg_get_functiondef()`, like 059 |
| 070 `bank_keeps_every_entry` | Drops the 60-per-account bank trim trigger | **Take.** The desktop build still has the trigger (its 006, `trim_bank_transactions`) |
| 071 `opening_balance_entry_type` | Fixes `create_customer_with_opening()`'s enum cast | **Skip.** The desktop build found and fixed this itself in its 023, before this repo did |
| 072 `close_internal_functions` | Revokes outside access to ten internal functions | **Supabase-specific; adapt or skip.** The leak was Supabase's `anon` role. The desktop build has no `anon` and no network exposure; if wanted, the equivalent is revoking the same ten from `app_user` (the app never calls them directly; every caller is SECURITY DEFINER). Low priority |

## 2. The app: the new look, new pages, new shared files

**The new look on every page (September 2026).** The single biggest change.
Each page's markup moved out of `app/admin/**/page.js` into a view component
under `app/_components/admin/<page>/`, built on shared pieces. Read
`docs/UI_CONVENTIONS.md` -> "The new look" first. Copy, verbatim unless the
desktop build changed the old file:

- Shared pieces, `app/_components/admin/dashboard/`: `TitleHeader`,
  `DayHeader`, `SectionHeader`, `KpiCard`, `FigureTile`, `FuelCard`,
  `TankGauge`, `TrendWindow`, `TrendCharts`, `Notice`, `LubricantPanels`,
  `MonthEndStock`, `tones.js`; `app/_components/ui/Sparkline.js` and
  `DeltaBadge.js`; the new classes at the end of `app/_styles/globals.css`.
- One view per page: `account/`, `activity/`, `banking/`, `company-assets/`,
  `customers/` (two), `dashboard/DashboardView`, `expenses/`, `guide/`,
  `lubricants/`, `purchases/`, `readings/`, `reports/` (three), `settings/`
  (two), `stock/`, `suppliers/` (eight), `treasury/`.
- **Deleted here, delete there too:** `AdminStats.js`, `CashCreditChart.js`,
  `ChartTooltip.js`, `DateNav.js`, `LubricantTrendChart.js`,
  `RegisterSummary.js`, `SalesTrendChart.js`, `TrendRange.js`,
  `ui/PageHeader.js`.
- `app/_lib/`: `format-helpers.js` (`withoutDashes`, `nonBreakingHyphens`,
  `saleAmount`), `date-helpers.js`, `helpers.js`, `guide-content.js`,
  `excel-report.js`, `treasury-categories.js`; and `app/layout.js`.
- **Changed in place since `3d696ea`, merge rather than copy blind:**
  `app/_styles/globals.css` (tokens, `.fuel-band`, and the new-look classes
  `.panel`, `.icon-tile`, `.caption`, `.seg*`, `.callout*`, `.figure-box`),
  `AdminSidebar.js` (each section's glyph in an icon tile, filled Slate for
  the open one; the Suppliers link; "Company Assets" shortened to "Assets";
  the Hide/Close menu labels), and in `app/_components/ui/`: `AppTheme.js`, `ConfirmAction.js`,
  `DeltaBadge.js`, `Dialog.js`, `DownloadNotice.js`, `EmptyState.js`,
  `Icon.js` (new glyphs), `IconButton.js`, `Pager.js`. The desktop
  `AppTheme.js` wraps MUI in its own cache provider: take the palette and
  component overrides, keep its wrapper. `git diff 3d696ea -- app/_styles
  app/_components/ui app/_components/admin/AdminSidebar.js` is the whole of it.
- `fuel-colors.js` is unchanged since `3d696ea`, but the new views lean on it
  for every fuel hue (`soft`, `solid`, `tint`, `raw`); a desktop page that
  hard-codes a petrol or diesel colour should read from it instead.
- `docs/UI_CONVENTIONS.md` comes across whole: its component tables, "The new
  look" rules, and the note on each page as it was moved over are what the
  desktop pages should match.
- **No em dash anywhere a person reads** (the owner's rule). Text the database
  writes goes through `withoutDashes()` on the way to the screen.

**New pages and features**, each with its data and actions:

| Feature | Files | Data / actions to add to the desktop build's hand-ported pair |
|---|---|---|
| **Suppliers** (067) | `app/admin/suppliers/` (`page.js`, `[id]/page.js`, `loading.js`), `suppliers/*` components; `SupplierSelect` on both purchase forms | `getSupplierSummaries`, `getSupplierLedgerPage`, `getSupplierNames`; `saveSupplier`, `setSupplierActive`, `recordSupplierEntry`, `recordSupplierPayment`, `cancelSupplierEntry` |
| **Correct a ledger entry** (063) | `CorrectEntryButton.js` | `correctLedgerEntry` |
| **Running balance and statement** (064) | `StatementPreview.js`, `PrintStatementButton.js`, `app/_lib/customer-statement.js`, `app/_lib/statement-pdf.js`, `app/admin/customers/[id]/statement/route.js`; **new dependency `pdf-lib`** | `getLedgerEntriesForStatement` (and `get_ledger_entries_page` now returns `balance_after`) |
| **Replace a damaged unit** (056, 058) | `ReplaceUnitButton.js`, Settings | `replaceUnit` |
| **Main bank account** (065) | `MakeMainAccountButton.js`, Banking | `setMainBankAccount` |
| **Banking pages in Postgres** (070) | Banking | `getBankTransactions` is replaced by `getBankTransactionsPage` (range + exact count) |
| **Back-dated price re-prices** (066) | Readings, Settings | `getRatesInForce`; price save/remove now go through `set_fuel_price` / `remove_fuel_price` |
| **Month-end stock** (068) | `MonthEndStock` on Dashboard and Reports | `getMonthEndStock` |
| **Last dip per tank on Settings** | Settings | `getLastStockCheck` |

**Online-only, do not port:**

- The Settings Backup panel and `app/admin/settings/backup/route.js`
  (051's JSON backup; the desktop build backs itself up its own way).
- `ALLOW_FULL_RESET` testing scaffolding, unless the desktop build already has
  its own reset.
- Anything about Supabase grants, Vercel, `vercel.json` or `proxy.js`
  behaviour that the desktop build already replaced.

## 3. Checks before calling the sync done

1. Fresh install: every migration applies in order on an empty database
   (`electron/bootstrap-db.js` path), with no error.
2. 059 and 069 really patched their targets (read the function bodies back).
3. Activity log: adding a supplier, a supplier payment and a unit replacement
   each writes a line.
4. A new customer with an opening balance saves (the desktop build's 023 fix).
5. Render every page at 1366, 1024 and 400 px wide, as both repos' `CLAUDE.md`
   require, and compare against the live site.
6. Record the new sync point in the desktop build's `PROGRESS.md`, as a
   "fourth catch-up: reference `3d696ea` -> `<this repo's main commit>`".

## Al Hakeem: the owner sets up his own forecourt (migration 800)

This copy's owner sets up his tanks and nozzles himself, as many as he has,
each nozzle pointed at the tank he chooses. The database starts with none
(`supabase/setup/start-empty.sql` removes the master's seeded two tanks, six
nozzles and four placeholder suppliers).

- **Settings**: "Add a tank" in the Tanks header, "Add a nozzle" in the
  Dispensing units header (`ForecourtSetup.js`), empty states saying what to do
  first, and a remove button on a tank with no nozzle, delivery or dip and on a
  nozzle with no readings - for mistakes made while setting up. Anything that
  has traded stays, as everywhere in the app.
- **Dashboard**: until there is a tank, a nozzle and a price for every fuel a
  tank holds, it is "Set up your pump" (`SetupChecklist.js`): those three
  steps, then links to customers, the safe, the bank, suppliers and staff.
- **A nozzle added after trading has begun** carries the day it starts
  (`commissioned_on`), so no earlier day changes; one added before is part of
  the pump from the start, like the master's seeded nozzles.

Two things found testing it, both fixed before it shipped: the position rule
(`nozzles_one_pump_per_position`) is a deferred constraint, so a handler round
the insert never sees it - `add_nozzle` checks for a clash itself, in words;
and a new tank's book stock is only recalculated on an UPDATE of its opening
stock, so `add_tank` calls `recalc_tank_stock()` itself, or a new tank read 0 L.
Rehearsed with two diesel tanks and a petrol tank, seven nozzles on four units
and a day of trading: each tank came down by its own nozzles' litres, and the
monthly report and daily summary counted all three tanks.



## Al Hakeem: one account, many vehicles (migration 801)

Some of this owner's customers are transport companies with 10 to 15 vehicles
and one khata. He wanted to keep the one account and still know which vehicle
took what. Asked, he chose **one credit limit per customer, no drivers, and
the fill recorded against the vehicle**.

- **The customer's page** has a Vehicles section above the history: a box to
  add a number, and a table of each vehicle with its slips, litres, fuel
  rupees and oil rupees, all time, summed in Postgres
  (`get_customer_vehicle_totals`). Slips that named no vehicle get a row of
  their own, so the column adds up to the account. The owner removes a
  vehicle (deleted if it never took a slip, otherwise retired and kept on the
  old slips) and can bring it back.
- **The slip line** on a reading gains a "Vehicle no." box: type the number on
  the windscreen and the customer and vehicle are both chosen, because the
  driver knows his truck and not always whose account it is on. Under the
  customer, a vehicle choice: absent for a customer with none, filled in for
  one with one, and required for a fleet, so a fleet slip is never filed
  against nobody by accident ("Not one of these" is always there for a truck
  not yet on the list). The two oil forms carry the same choice.
- **The ledger, the statement preview and the PDF** name the vehicle on each
  row (a violet badge on screen, "Vehicle LES-4471" on the PDF's second line).
  The Customers list says "5 vehicles" under a fleet's name and its search
  finds an account by any of its numbers, typed with or without the dash.
- **The rules are the database's**: a slip's vehicle must be on the slip's
  account and active (`trg_vehicle_belongs_to_customer`), a number is on one
  account at a time, and `vehicle_id` is copied from the slip to the ledger
  entry it posts. The customer's old single vehicle box joins the list, by
  trigger and by a backfill, so nothing typed before is lost.

Every new column is nullable (backups from before 801 restore), the table is in
`backup_table_order()` after `customers`, and adding or removing a vehicle is
in the activity log. Tested on a local Postgres with a fleet of five, slips on
three of them, oil on credit, a removed vehicle refused on a new slip, staff
refused on remove, and a retire and restore. Rendered at 1366 and 400 px.
`docs/PORT_TO_OTHER_PUMPS.md` lists it for the master and the other pumps.
