# Al Hakeem Filling Station PSO

Daily management for the petrol pump: nozzle readings, fuel purchases,
lubricant sales, stock gain/loss, customer credit, banking and monthly profit.

**Naming and logo** live in `app/_lib/brand.js`. Change `BUSINESS_NAME` there and
the sidebar, the login screen, every browser tab title and the monthly workbook
all follow. The logo is whatever sits at `public/logo.png` — drop a file in and
it appears; take it away and the initials tile comes back. No code change either
way.

Built with Next.js (App Router, plain JavaScript), Tailwind CSS v4 and Supabase
(Postgres + RLS + Auth). Deploys to Vercel.

---

## First-time setup

### 1. Environment variables

Copy `.env.example` to `.env.local` and fill it in from the Supabase dashboard
(**Project Settings → API**):

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-publishable-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

The first two are safe in the browser — RLS is what protects the data, not those
keys. `SUPABASE_SERVICE_ROLE_KEY` is secret, bypasses RLS entirely, and is used
in exactly one place: creating staff logins. If it ever leaks, rotate it in the
dashboard immediately.

> **Careful:** `NEXT_PUBLIC_*` values are baked in when the app is **built**, not
> when it runs. On Vercel, set them in project settings *before* deploying, and
> redeploy after changing one — otherwise the old value stays compiled in.

### 2. Install and run

```bash
npm install
npm run dev
```

### 3. Create the first owner login

There is no public signup — by design. So the very first account has to be made
by hand, once:

1. In the Supabase dashboard go to **Authentication → Users → Add user**.
2. Enter your father's email and a password, and tick **Auto Confirm User**.
3. A `profiles` row is created automatically, as `data_entry`. Promote it in the
   **SQL Editor**:

   ```sql
   update public.profiles
      set role = 'super_admin', full_name = 'His Name'
    where id = (select id from auth.users where email = 'his-email@example.com');
   ```

From then on every other login is created inside the app, under **Account →
Add login**. Never add accounts by hand again.

### 4. Set the fuel prices

Readings cannot be entered until a rate exists for each fuel. Go to **Settings →
Fuel prices** and set petrol and diesel.

---

## The two roles

| | `super_admin` (owner) | `data_entry` (staff) |
|---|---|---|
| Enter daily readings | yes | yes |
| Record lubricant sales | yes | yes |
| Record purchases and dips | yes | yes |
| Add customers, record payments | yes | yes |
| See sales totals, profit, reports | yes | **no** |
| Record and see expenses | yes | **no** |
| See the bank accounts and their balances | yes | **no** |
| See and record the cash in the safe (Treasury) | yes | **no** |
| See and manage company assets | yes | **no** |
| See and pay suppliers (what the pump owes them) | yes | **no** |
| Change prices, tanks, nozzles | yes | **no** |
| Add or remove a lubricant from the shelf | yes | **no** |
| Correct or delete past entries | yes | **no** |
| Manage staff logins | yes | **no** |

Roles live in the `profiles` table — no email is hardcoded anywhere. They are
enforced in three independent places:

1. **RLS policies in Postgres** — the real protection. Even with a stolen
   publishable key and a handwritten query, the database refuses.
2. **`requireRole()`** at the top of every Server Action.
3. **The navigation**, which hides what a role cannot open. Cosmetic only.

---

## The daily routine

1. During the day the attendant writes credit slips on paper, as now.
2. In the evening, open **Readings**. Each nozzle's opening figure is already
   filled in from yesterday's closing.
3. Type the closing reading. Litres and value appear instantly.
4. For each credit slip, press **+ Add customer**, pick the customer and type the
   litres — the amount fills in at today's rate.
5. **Cash is calculated for you** as whatever is left over. Check it against the
   notes in the drawer *before* saving. If it does not match, something is wrong
   while it is still easy to fix. (The figure is worked out by the database, not
   the browser — see migration 052 for the paisa that made that necessary.)
6. Save. Each customer's balance updates by itself.

Oil sold over the counter goes under **Lubricants**, one sale at a time as it
happens: pick the product, tap the pack size or type the litres, and say whether
it was cash or credit. Credit lands on the same customer ledger as fuel.

Deliveries go under **Purchases** — fuel into the tanks and lubricants onto the
shelf, in one list. Enter the litres and the amount on the delivery note; the
rate per litre is worked out for you. Pick the supplier on the delivery and
its invoice amount lands on that supplier's account by itself; paying them is
done from **Suppliers** (owner only), which takes the money out of the safe or
a bank account in the same step. The dip stick reading, and what is left on
the lubricant shelf, both sit under **Stock**.

Every screen with a date has arrows either side of a date box; picking a date in
the box goes straight to that day. If a day was entered against the wrong date,
the owner can wipe it with **Clear this day** on Readings and type it again.

### Collecting what a customer owes

Credit here runs seven to fifteen days, sometimes a month, and is settled mostly
in one lump and sometimes in parts. **Print statement**, on a customer's own
page, produces the page you take with you when you go to collect: a PDF of the
customer's **account** — every fill he took and every payment he made, oldest
first, each line showing what was owed immediately after it, ending in one
**total now due** that is exactly the balance at the top of the screen.

It is a **balance-forward** statement, which is the shape the paper khata it
replaces always had, and the shape a customer can check: every line on it is a
row of the ledger, so he can put it beside his own book and tick down the two
together.

> It used to be an **open-item** statement — only the fills still unpaid, each
> showing how much of it had been covered, with payments applied oldest-first.
> The arithmetic was right and it always totalled the balance, but a Rs 5,000
> fill printed as *"Rs 4,980 paid off, Rs 20 still due"*, and Rs 4,980 appears
> nowhere in the ledger: it was the tail of a payment spread across four earlier
> fills. A statement is checked by finding its figures somewhere else, and those
> could not be found. See `docs/CHANGELOG.md` for the whole story.

**The statement appears on screen first.** The button opens it — the total, the
account itself, what the period came to — so the figures can be checked against
the transaction history on the same page before anything is downloaded. Changing
the day range redraws it immediately. The PDF is produced from exactly what is
shown.

**The period is a date range**, From and To, either end able to be left blank.
Chips fill the boxes for the common cases (this month, last month, last 30 days,
the whole account) and the boxes stay editable, so "last month but up to the
28th" is a tap and a nudge. A haulier settling for August wants August, which no
number of days back from today can say.

Four things worth knowing before you use it:

- **A start date changes what is listed, never what is owed.** Everything before
  it collapses into one *"balance brought forward"* line at the head of the
  table, so the column still runs down to the same closing figure.
- **An end date in the past changes what the closing figure MEANS**, and the page
  says so: it reads *"Balance as at 31 Aug 2026"* rather than *"Total now due"*,
  because entries since that date are real and are not on the sheet. Print
  August and you are handing over what he owed on the 31st, which is the right
  document for settling August and the wrong one for collecting today. Leave To
  blank (or set it to today) and it closes with what is owed now.
- **Corrections are on the page but they are not money.** Nothing here is ever
  deleted, so a cancelled entry and the row that cancels it both appear — marked
  as such, greyed, and kept out of *fuel taken* and *paid*. Only the balance
  column carries them. Listing a reversal as a payment would be a receipt for
  money nobody handed over, and that has happened here once (see below).
- **The balance beside each line is the database's figure**, the same one the
  transaction history shows against the same row. The statement and the screen
  agree row for row; that is what makes either of them worth checking.

The lines on the page always add up to the total: opening balance, plus fuel
taken, less paid, is the closing figure. If they ever did not, the statement
would say so on its own line rather than print a column that quietly fails to
reach its own total.

If the account is clear the statement says so in as many words, which makes it
useful as a receipt that nothing is outstanding. Both the owner and counter
staff can print one — it reads and writes nothing.

### The safe on site

Separate from all of the above, and owner-only: **Treasury** is the cash
physically kept in the safe at the pump — the day's takings before they are
banked, money lent to people and taken back, cash handed to a supplier against
a purchase code, and a float for whatever needs paying that hour. None of it is
in the banking system, which is exactly why it has its own page rather than a
tab on Banking.

It is the owner's own "Tajori" spreadsheet, in the app: one line per movement,
in the order it happened, with a running balance beside each. **Press Record
cash**, say whether it came in or went out, type the amount, pick what it was
for, and add the same free-text detail he would have typed in the sheet
("paid by the manager", "transfer to the supplier's code"). The reasons are a
fixed list per direction so a month's cash can be broken down without anyone
reading thirty lines of prose.

**Nothing else in the app writes to it or reads from it**, deliberately. The
day's cash is entered here by hand even though Readings already knows the
figure, because the safe is reconciled against the notes in the drawer, not
against another screen — an entry that appeared in it by itself would be an
entry nobody counted.

**It is read one day at a time.** A page is a day, not a fixed number of rows,
so the screen holds the three to six lines of one evening with the day's own
opening and closing figures above them — which is what actually gets checked
against the notes in the safe. The arrows step to the previous and next days
that *have* entries, skipping any with nothing on them, and the date box jumps
straight to a day.

---

## What the database will not let you do

This is a money tool, so several rules are enforced in Postgres itself, where no
amount of application code can get around them.

- **Cash + credit must equal what the meter says was sold.** A day cannot be
  saved half-balanced.
- **Credit slips must add up to the reading's credit amount.** Checked at the end
  of the transaction, so a reading and its slips are saved together or not at
  all.
- **A meter cannot run backwards** — closing is never below opening.
- **Two readings for one nozzle may not overlap.** A meter only moves
  forwards, so if a later reading starts before an earlier one finished, the
  same litres are on the books twice. Refused, naming the other date and how
  many litres would be duplicated. A *gap* is still allowed — that is a
  skipped day or a replaced meter, and blocking it would leave no way
  forward — so gaps stay warnings in the entry dialog.
- **A day the next reading already covers whole cannot be entered at all.**
  If the following reading opens exactly where this day starts, there is no
  honest figure left to type: the only closing the overlap rule would still
  accept is the opening itself, and a nought-litre day says "nothing sold" for
  a day that traded. So enter days **oldest first**. If one is missed, clear
  everything after it and re-enter forwards — back-filling underneath a saved
  day is refused, and the message names the day to clear.
- **Two questions about stock, and they are not the same question.**
  `calculate_expected_stock(tank, d)` is what the **books say** should be in the
  tank at the close of `d`, and it ignores a dip closing `d` on purpose — that
  dip is the figure it is about to be compared against, so letting it be its own
  baseline would make every gain/loss nought. `tank_stock_on_hand(tank, d)` is
  what the tank **actually holds**, and it uses that dip. Valuing stock, and so
  profit, asks the second one. Asking the first cost a month's profit a whole
  month's stock loss — see migration 059.

- **A reading cannot be dated to a day its nozzle was not there.** Since a unit
  can be replaced (see below), each nozzle carries the range of days it was
  actually standing on the forecourt, and a reading outside that range is
  refused — naming the day the pump was fitted or carted away. Litres invented
  for a pump that was not there look like any other day's on every screen that
  adds them up.
- **Two pumps cannot stand at the same position on the same day.** A unit
  number and nozzle label together are a position on the forecourt, and the
  rule holds across the whole history, not just today — a replaced pump still
  occupies its old position for the days it worked. Enforced as an exclusion
  constraint over each nozzle's service window, and *deferred*, so a straight
  swap (petrol becomes Unit 1, diesel becomes Unit 2) saves as one statement
  instead of being refused halfway through.
- **A replaced nozzle cannot be rewired.** Its `tank_id` decides which tank
  every one of its past sales was drawn out of, so changing it would move
  months of litres between tanks and make both tanks' gain/loss fiction. Its
  unit number and label *can* still be changed — those are captions on rows
  that are already correct, and freezing them would make it impossible to move
  another pump into the position it used to hold.
- **A nozzle's tank is fixed once it has any day entered against it.**
  `tank_id` carries no date, and it decides which tank every litre that nozzle
  ever sold came out of — so re-pointing a pump that has been trading rewrites
  months of stock, gain/loss, litres by fuel and the profit split, silently and
  backwards. Settable freely until the first reading, history after it. A pump
  genuinely re-piped onto another fuel is a replacement; see "When a dispensing
  unit is damaged, moved or re-piped".

- **The customer ledger is append-only.** No update, no delete, for anybody,
  including the owner and including the service-role key. A mistake is corrected
  by posting a new entry pointing the other way, so the history always adds up.
  This is enforced by a database trigger, not just by permissions. The
  exceptions are narrow, and these are all of them:
  - `created_by`, `credit_sale_id` and `lubricant_sale_id` may be set to null
    when the profile, credit slip or lubricant sale they point at is deleted.
    Every other column must be byte-for-byte identical, so this cannot be used
    as a way in to change an amount, a date or a customer.
  - `correct_ledger_entry()` fixes a mistyped entry **without breaking the
    rule**: it posts a reversal — same amount, same date, opposite direction —
    and, unless the entry should never have existed, a replacement, both in one
    statement. Nothing is edited and nothing is deleted; the cancelled row stays
    on the page struck through. It refuses a row posted automatically from a
    reading or a lubricant sale (correct the sale, and the slip follows), a row
    already cancelled, and a cancellation itself. Owner only.
  - `purge_customer()` may delete a customer's entries — see below. It is the
    only caller that can, because the trigger requires a transaction-local
    setting naming that one customer, and nothing else ever sets it. A stray
    `delete` from server code or the API still gets the same refusal it always
    did.
- **The supplier ledger is append-only too** (067). What the pump owes each
  supplier is a running list of entries, and no entry is edited or deleted: a
  delivery's invoice is posted by trigger, deleting the delivery posts a
  reversal, and cancelling a payment posts a reversal and puts the money back
  in the safe or the bank account it came from, in the same transaction.
- **Deleting a reading reverses its credit slips, it does not erase them.** The
  customer's original debit stays on the ledger and an offsetting credit is
  posted beside it, so the balance comes back to correct while the history still
  reads as what happened. Same for clearing a whole day.
- **Deleting a lubricant sale reverses its credit the same way**, in the same
  transaction as the delete, so a customer is never left owing money for a tin
  the books no longer show them taking.
- **A lubricant sale must balance and must be attributable.** Cash plus credit
  has to equal the amount charged, and any credit on it has to name the customer
  it is owed by.
- **A loose oil product must have a selling rate.** The rate is the only thing
  turning "Rs 20 of oil" into litres off the drum, so without one a sale could
  take money and no stock, and the drum would read full for ever.
- **A customer carrying a balance cannot be removed** — in either direction,
  whether they owe the pump or the pump owes them. Judged to the nearest rupee,
  so the most it can forgive is 49 paisa, less than the smallest coin that
  exists; anything a customer could actually be asked for still blocks removal
  and is named in the message. A removed customer drops out
  of the outstanding total, so this would write a debt off (or lose a credit)
  with nothing on screen to say it had happened. Settle the account first. A
  customer who never traded is deleted outright; one with history is retired,
  and can be brought back from the **Removed** list.
- **A customer's opening balance is created with them, in one transaction.**
  Most names typed into this app came out of a paper register and already owe
  money, so the New customer form asks. The customer row and the opening ledger
  entry are written by one function (`create_customer_with_opening`) because
  two separate inserts could leave the customer created and the balance
  missing — which is the silent zero the field exists to prevent. The amount is
  always positive and a direction says which way it goes; a signed figure would
  let "-500" and "they owe us" disagree with nothing to settle it.
- **A customer can only be deleted *for good* if they never actually traded.**
  From the **Removed** list, with the name typed to confirm. Allowed when the
  account is settled and its whole footprint is entries the owner typed
  himself — payments and adjustments, which no reading or month depends on.
  Refused outright once there is a fuel credit slip or a lubricant sale against
  the name, because a slip belongs to a nozzle reading whose credit amount must
  equal the sum of its slips, and the litres behind it are part of a day
  already reported and exported. The refusal points at clearing the day on
  Readings instead, which reverses the slip properly.
- **Tank and lubricant stock are recalculated from history**, never incremented,
  so the cached figures cannot drift away from the purchases, sales and dips
  that produced them. **A dip's gain/loss is rebuilt the same way** — see "The
  gain/loss figures are never stale" below.
- **Two dips may not close the same trading day** for one tank. A dip is a
  moment; an evening dip on the 10th and a morning dip on the 11th measure the
  same one, and counting both would double a month's gain or loss.
- **A tank cannot be given more opening stock than it holds.**
- **The safe may never hold less than nothing.** The treasury's running
  balance is checked over the *whole chain*, not just at the end: an entry
  added or removed in the middle moves every balance after it, so a row that
  is fine where it lands can still push a later day below zero, and deleting
  an early cash-in is refused for the same reason. The message names the line
  it breaks on and how far short it falls. A *future* date is allowed — there
  is nothing dishonest about one — but the app warns before saving it.
- **The safe has one opening entry, ever.** "Already in the safe" is the single
  moment before the sheet started; a second one is always a miscategorised
  cash-in.
- **A treasury category belongs to one direction.** "Deposited in a bank" is
  not a way cash arrives, and "Cash of shift closing" is not a way it leaves.
- **No bank account may go below zero** — checked per account, not across the
  total. A payment too large for one account is split across the others the
  owner picks, computed in the database from real balances.
- **At most one bank account is the main one** (the one the money in / money
  out form starts on). A unique index refuses a second, and
  `set_main_bank_account()` clears the old one before setting the new, so a
  change never passes through two (065).
- **A delivery's invoice total is what gets stored**; its rate per litre is
  generated from it. The amount on the note is the fact - see "Things worth
  knowing".
- **Every change is logged, by the database, and the log cannot be edited.**
  A trigger on eighteen tables writes one readable line into `activity_log` for
  each insert, update and delete: who did it, when, what it was, and — on an
  edit — which fields moved and what they moved from. Only the owner can read
  it (`/admin/activity`), and *nobody* can write to it by hand or change a line
  afterwards: there is no insert policy, and update and delete raise the same
  way the ledger's do. The one thing the owner may do to it is throw away its
  OLD end — whole retention periods only (keep the last month, three, six or
  twelve), the cutoff worked out in the database, the recent month never
  touched, and the trim itself written into the log as a line. A single entry
  can still never be picked out and removed, and no entry can ever be edited;
  see `050_clear_the_old_activity_log.sql`. See `035_activity_log.sql` for the two things it
  deliberately stays quiet about (stock recalculation, and the ledger row a
  credit slip posts for itself) and for why the trigger swallows its own errors
  rather than ever blocking a write.

- **Internal functions cannot be called from outside** (072). The stock-value,
  cost-of-sales, backup and activity helpers are called only from inside other
  functions; neither the public key nor a staff login may call them directly.
  Supabase grants every new function to `anon` and `authenticated` by name, so
  `revoke ... from public` alone is not enough: revoke from all three.

If the app and the database ever disagree, the database is right.

---

## How profit is worked out

```
profit = all sales − cost of stock SOLD − expenses

cost of stock sold = opening stock + everything bought − closing stock
```

Both trades are in it: fuel and lubricants, sales and purchases alike.

**It counts stock SOLD, not stock bought**, and the difference is the whole
point. Until migration 049 it subtracted what was bought, which meant a
delivery still sitting in the tank on the last of the month was charged
against that month — August 2026 showed a loss of Rs 1,464,581 for a month
that actually made Rs 566,307, because 10,000 L of petrol arrived on the 21st
and had not been sold yet. A month that instead ran the tanks *down* was
overstated for the mirror-image reason. The errors cancel over years and never
within a month, which is the only period anybody reads.

**Stock on hand is valued at the lower of the pump price that day and the
weighted average cost of the deliveries it is actually made of** (069) — walk that tank's purchases newest-first until its litres
are accounted for. For a tank this is also literally true: the fuel in there is
the last few loads. A single flat average over every purchase ever was
rejected because in a rising market it values a full tank below what it cost,
which reintroduces a smaller version of the same bug.

Stock older than any recorded delivery — the opening quantity typed into
**Settings → Tanks** when the pump joined the app — is valued at that tank's
all-time average purchase rate. That is an estimate, and it only affects the
first month that has purchases; every month after opens on stock the app
watched arrive.

**"Stock bought" is still its own figure on the Reports page.** It is real, it
is what is owed to suppliers against, and it is what the Treasury and Banking
pages move. It is simply not what profit subtracts.

Company assets and bank transfers are outside profit entirely — see "Things
worth knowing".

---

## How stock is worked out

```
expected stock = last measured dip
               + fuel delivered since
               − litres sold since
```

The baseline is the last physical dip, because a measured number beats a
calculated one. Before the first dip it falls back to the tank's opening stock
(set under **Settings → Tanks**).

`gain / loss = actual dip − expected`.

### A dip belongs to the day it closes, not the day it was taken

This pump dips **first thing in the morning**, before the pumps are switched
on, at the same sitting as yesterday's nozzle readings are typed in. A dip
taken on the morning of the 11th therefore measures the tank as it stood at the
**close of the 10th**, and it is the 10th's sales it has to be checked against.

So a dip records two things: `check_date`, the day the rod went in, and
`taken` — `morning` or `evening`. From them the database generates
**`books_date`**, the trading day the dip closes:

```
taken = 'morning'   books_date = check_date − 1
taken = 'evening'   books_date = check_date
```

**`books_date` is what every gain/loss figure is computed and reported
against** — the Stock page's history, the dashboard's tank card, and the
month's gain/loss in the report and the export. The Stock page still asks for
the dip on the day you took it; the card names the day it closes before you
save it. Getting this wrong is not a rounding error: it reports a whole day's
sales as a loss, every day. See migration 039 and `docs/CHANGELOG.md`.

Two dips may not close the same trading day for one tank — an evening dip on
the 10th and a morning dip on the 11th are two measurements of one moment.

### The gain/loss figures are never stale

`stock_checks.expected_stock` is **recalculated from history by trigger**,
never written once and left. A reading typed the next morning, a delivery
dated to when it actually arrived, or an earlier dip back-filled afterwards all
move the figures that come after them, and they are all rebuilt on the spot.
`gain_loss` is a generated column off it, so both stay right together. Same
rule, and the same reason, as `tanks.current_stock_litres`.

### Correcting a dip

A mistyped rod reading is the baseline every later figure is built on, so a
wrong one is wrong for every day after it. The owner clears it on the Stock
page (**Clear this dip**) and records it again. Everything behind it re-bases
itself.

---

## When a dispensing unit is damaged, moved or re-piped

Pumps get hit by lorries, wear out, and get shuffled around the forecourt. This
happens at every filling station, so the app has proper tools for it rather than
expecting somebody to edit numbers until the screen looks right. **All of it is
in Settings**, and the whole job is choosing the right one of three controls.

### Which control, and why it matters

| What actually happened | Use | What it does to the past |
| --- | --- | --- |
| The pump is the same machine; it just stands somewhere else now, or you renumbered the forecourt | **Edit nozzle wiring** → change the unit number | Renames it on **every day, including days already entered** |
| The pump was taken away and a different machine put in its place | **Replace this unit** | Old readings stay under the old pump; the new one starts on its own meter |
| The same machine is now on a different fuel (re-piped diesel↔petrol) | **Replace this unit** | Same as above — a date divides before from after |

The third row is the one that catches people, so it is worth saying plainly:
**a pump that changed fuel is a replacement, even though no hardware changed.**
For the books, a nozzle *is* "a meter, drawing from a tank, over a span of
days" — and when the tank behind it changes, that span has ended and a new one
has begun. Give the old fuel its last day, the new fuel its first, pick the new
tank, and carry the meter across at the figure it stands at.

**You cannot do it by changing the tank in the wiring dialog**, and the app will
not let you: `tank_id` carries no date, so re-pointing a pump that has been
trading moves *every litre it ever sold* into the other tank. That is not
hypothetical — it happened here on 2 September 2026 and moved 19,293 litres of
August petrol into the diesel tank before anyone noticed. The tank is therefore
fixed the moment a nozzle has its first day entered, and the dialog says so.

### Doing a swap-and-replace, in order

The awkward real case is two events at once: one pump scrapped, another moved
into its place, a new one bought. That happened here on 1 September 2026 and the
order that works is:

1. **Rename first.** Move the surviving pump to its new unit number in **Edit
   nozzle wiring**. A straight swap (2→1 and 1→2) is fine in one save — the
   constraint that stops two pumps sharing a position is deferred exactly so
   that a swap does not have to be done in some impossible order.
2. **Then replace.** Run **Replace this unit** on the pump that was scrapped,
   and again on any pump that changed fuel.
3. **Then check the meters.** See below, before you enter a single day.

Renaming applies to the whole history, so afterwards August reads under the new
numbers too. If you want the old month to keep the numbers it actually had, the
retired rows can be renumbered back independently — they are separate rows with
their own dates, and the app keeps one pump per position per day either way.

### Read the meter off the machine, always

The **Meter starts at** box — in *Replace this unit*, and in the wiring dialog
until the first day is entered — wants **what the dial says right now, standing
at the pump.** Not the old pump's closing figure, and not zero unless the meter
really is at zero.

**A dispenser run dry still counts.** The meter is a mechanical totaliser on the
outlet, not a measurement of fuel: if the pump is cycled with its lines empty
while it is being shifted, the dial turns and no fuel moves. Unit 1's two
nozzles gained **157 litres** that way on 1 September 2026. Had the old closing
figures been entered, that 157 L would have been billed to customers as the
first day's sales.

Get it wrong in the other direction and it is worse: a starting reading left at
**0** on a pump that has been trading counts the meter's entire lifetime as one
day of sales.

### The deadline, and the way back

**A starting reading is only consulted until that nozzle's first saved day.**
After that the day's opening lives on the reading itself, every later day chains
off the previous day's closing, and the box in the wiring dialog goes grey. It
is per nozzle, not per unit — enter a day for A and A greys out while B stays
open.

If the figure turns out wrong after a day is entered (your accountant checks it
and disagrees), the route is: **delete that day on the Readings screen, correct
the meter in the wiring dialog, enter the day again.**

### What the database will refuse, so you cannot get it wrong quietly

- Two pumps standing at the same unit number and nozzle label **on overlapping
  days** — retired pumps still hold their old position for the days they worked.
- Changing the **tank** of a nozzle that has any day entered against it.
- Changing the tank or the starting meter of a **replaced** nozzle at all.
- A reading dated to a day its pump was not on the forecourt.
- A meter running backwards.

### Fuel drawn during the changeover

If fuel genuinely *is* drawn while the work is done — flushing lines,
calibration — it cannot be kept out of profit, and it is worth understanding why
before asking. Profit subtracts the stock that was **sold**, and closing stock is
valued at what the tank physically holds, so litres that leave without a sale
lower closing stock and lower profit by their cost. Nobody paid for that fuel;
the only choice available is whether it reads as unexplained shrinkage at the
next dip or as a named line. Litres the meter counted **without dispensing** are
a different thing entirely and cost nothing — that is the case above.

---

## Project layout

```
app/
  layout.js, page.js
  admin/
    layout.js              auth shell for every admin page
    login/                 sign in (no signup)
    page.js                dashboard - owner only; the fetch, drawn by _components/admin/dashboard/DashboardView.js
    readings/              the daily entry screen
    lubricants/            every oil sale of the day, packed and loose, plus the shelf
      loose/               redirect only - the drum's old route, kept for old links
    purchases/             fuel deliveries and lubricant restocks
    stock-checks/          dip readings, gain/loss, and lubricant stock
    customers/             list and [id] detail with ledger; adding is a dialog
      [id]/statement/      the statement of account as a PDF (route handler, no page)
    banking/               the owner's bank accounts - owner only
    treasury/              the cash in the safe on site - owner only
    expenses/              what the pump spends, by month - owner only
    company-assets/        what the pump has bought and kept - owner only
    suppliers/             each supplier's account: what is owed, payments - owner only
      [id]/                one supplier's ledger, paged
    reports/               monthly profit, charts, Excel export
      daily/               every trading day, newest first, paged
      register/            petrol and diesel day by day, with running gain/loss
    settings/              prices, tanks, nozzle wiring, the backup download
      fuel-prices/         the full rate history, paged
    account/               your own login, and staff logins for the owner
    guide/                 how to use the app, English and Urdu (?lang=ur)
    activity/              the audit trail, newest first, paged - owner only
  _components/
    admin/                 admin-only components
      dashboard/           the Dashboard's view, and the new look's shared pieces every page uses
      <page>/              one folder per page for its view (BankingView.js, ...): page.js does
                           the role check and the queries, the view draws, so fixtures can drive it
    ui/                    shared building blocks
  _lib/
    supabase.js            browser client
    supabase-server.js     server client (session-bound, RLS applies)
    supabase-auth.js       service-role client - staff accounts only
    data-service.js        every read query
    actions.js             every Server Action
    helpers.js             requireRole(), formatting, calculations
    date-helpers.js        dates, safe on the server AND in the browser
    format-helpers.js      formatRate(), saleAmount() - same reason as date-helpers
    brand.js               business name; the logo is public/logo.png
    guide-content.js       the guide's text, both languages, as data
    asset-categories.js    the five company-asset categories, as data
    treasury-categories.js the safe's reason lists, one per direction
    customer-avatar.js     a customer's initials and their stable tint
    fuel-colors.js         the single definition of petrol, diesel and lubricant
    excel-report.js        builds the monthly workbook from the template
    customer-statement.js  the account as a statement: every movement, windowed, checked
    statement-pdf.js       draws that as an A4 statement of account (pdf-lib)
  _styles/globals.css        tokens, .fuel-band, and the new look: .panel, .icon-tile, .caption, .seg, .callout
proxy.js                   session refresh + signed-in gate
scripts/                   restore-backup.mjs (disaster recovery), build-report-template.py, build-icons.py
supabase/migrations/       the schema, in order
docs/                      UI_CONVENTIONS.md, CHANGELOG.md
```

`_components`, `_lib` and `_styles` are underscore-prefixed on purpose — that is
the Next.js private-folder convention, which keeps them out of routing.

---

## If you are porting this off Supabase

Written for a session asked to build an offline or desktop version, because
the single most misleading thing about this codebase is how little of the
important logic is in the JavaScript.

**There is already an Electron build, and it runs Postgres locally.** That
changes the shape of this enormously and most of the warnings below are about
the harder case. On local Postgres the migrations in `supabase/migrations/`
apply **verbatim** — same triggers, same constraints, same RPCs, same
guarantees. Four things are the only real edits:

- **`auth.uid()`** is Supabase's, not Postgres's. It reads a JWT claim out of a
  session GUC. Anything using it — `auth_role()`, `is_super_admin()`,
  `activity_actor()`, the `created_by` defaults — needs the offline equivalent,
  whatever that build already does for the earlier migrations.
- **RLS** may be pointless in a single-user desktop build. Dropping it is a
  legitimate choice; forgetting it is not. Decide on purpose, and remember that
  `requireRole()` was only ever the second fence.
- **`profiles.id` references `auth.users`**, a Supabase-managed table.
- **`051_backup_and_restore.sql` is not for the desktop build at all.** It backs
  itself up its own way — a local Postgres on one laptop can copy its data
  directory or run `pg_dump`, which also captures the logins that this JSON
  export deliberately cannot. Skip the migration, the Settings panel, the
  download route and `scripts/restore-backup.mjs`. (If it is ever ported
  anyway: `restore_everything()` guards on `current_user` being `service_role`
  or `supabase_admin`, which is PostgREST's shape and means nothing offline,
  and the script speaks PostgREST over HTTP.)

Everything else — the balanced-day check, the append-only ledger, the overlap
rules, stock recalculation, the reporting RPCs, the activity log and its
retention trim — is plain Postgres and needs no translation at all.

**Backups offline are the desktop build's own business.** Its books live on one
laptop, and the right tools there are the ones this repo cannot use — a copy of
the data directory, or `pg_dump` on a timer, both of which capture the logins
too. What transfers is the discipline, not the code: rehearse the restore on a
copy before it is needed, and check row counts and money totals afterwards
rather than trusting the file.

**What DOES transfer from the restore work** is a fact about this schema: a
credit slip auto-posts its own ledger entry, so anything that replays rows
through the normal write path doubles every credit customer's balance. A
file-level or `pg_dump` restore avoids that by not going through the write path;
a row-by-row one needs triggers off, parents before children, and derived stock
recomputed at the end.

**The catch-up list for the desktop build** — migrations 044–051 and everything
that came with them, including what 044 needs that only Postgres provides — is
`docs/CHANGELOG.md` → "Porting the Treasury → Backup rounds to the offline
(Electron) build".

**Two things about `049_profit_counts_stock_sold.sql` specifically**, because it
is the one migration that is not purely declarative:

- It patches the three reporting RPCs by reading them back with
  `pg_get_functiondef` and re-declaring them, rather than reproducing them in
  full. That is plain Postgres and runs offline unchanged — but it **depends on
  the earlier definitions being present**, so the migrations must be applied in
  order and `005`, `010` and `041` must not have been skipped or edited. It
  raises rather than failing quietly if the expression it expects is not there.
- If the offline build ever **reimplements reporting outside Postgres**, this is
  the formula that must come with it:
  `profit = sales − (opening stock + purchases − closing stock) − expenses`.
  Copying the old `sales − purchases − expenses` reintroduces a bug that showed
  a Rs 1.46m loss in a month that made Rs 566,307 — and looks entirely
  reasonable while doing it. See "How profit is worked out" above.

**The database is not a passive store.** Seventy-two migrations of triggers,
check constraints and RPCs hold the rules that make the books trustworthy —
balanced days, an append-only ledger, no two readings covering the same
litres, stock recalculated from history rather than incremented, no account
going below zero. Swap Postgres for SQLite and **all of it is gone unless it
is rebuilt**, and nothing in the UI will complain, because the UI check was
only ever the courtesy. The list to work through is "What the database will
not let you do" above; the files are in `supabase/migrations/`.

**The activity log is the hardest single thing to port** (`035`, extended by
`036`). One trigger function on eighteen tables, written in PL/pgSQL, that
reads the changed row as
`jsonb`, diffs old against new, builds an English sentence, and inserts it into
an append-only table. Nothing in that paragraph exists in SQLite: no `to_jsonb`
on a row type, no `jsonb_object_keys`, no `auth.uid()` to name the actor. It
is portable in principle — the same idea works with `json_object` and a
per-table trigger, or by moving the logging into the write path — but it is a
day of work rather than a translation, and it is worth deciding early whether
an offline single-user build needs it at all. On a desktop app used by one
person, "who did this" has one answer.

**What is genuinely Supabase-shaped**, and would need replacing rather than
porting:

- `app/_lib/supabase-server.js` / `supabase-auth.js` / `supabase.js` — clients.
- `proxy.js` — session refresh and the signed-in gate.
- Every `.rpc(...)` call in `app/_lib/data-service.js`. These are not
  convenience wrappers; the aggregation happens in Postgres deliberately, so
  the dashboard and the monthly report cannot arrive at different answers.
- **RLS is the real access control.** `requireRole()` and `requirePageRole()`
  are defence in depth, not the fence. A single-user desktop build may not
  need RLS at all, but that is a decision to make on purpose, not by
  forgetting.

**What ports unchanged**: everything in `app/_components`, the formatting and
date helpers, `guide-content.js`, and the Excel export (`excel-report.js` plus
`report-template.xlsx`), which is pure XML manipulation with no server
dependency.

**Two behaviours worth carrying over deliberately**, because they were both
arrived at the hard way and are documented in `docs/CHANGELOG.md`: the
whole-rupee ledger with two-decimal meter arithmetic, and the `Asia/Karachi`
business day. Both caused real, quiet wrongness before they were fixed.

Server Actions and `revalidatePath` assume a server. An Electron build can
keep them by running Next locally, or replace them with IPC — but if the
caching model changes, re-read the prefetch/staleness measurements in the
changelog before assuming a cache is safe.

**Two facts that make a port easier than it looks.** Authentication is
password-only — `signInWithPassword` and `updateUser`, no magic links, no
reset emails, no `emailRedirectTo`. And there is **not one absolute URL** in
the codebase; every link is a path. So nothing has to be reconfigured when the
app moves to a different origin, which is also why attaching a custom domain
needed no code change at all.

**Do not ship the service-role key.** `app/_lib/supabase-auth.js` holds it and
uses it for exactly one thing: creating and deleting staff logins. It bypasses
RLS completely, so it must stay server-side. In a desktop build that is packed
into a binary anyone can unzip — move that call behind an Edge Function, or
drop staff accounts from the offline build entirely.

## Backups, and restoring from one

The books exist in one place. The Supabase project is on the free plan, which
has no daily backup anybody can restore from, so this is the whole of the
safety net — take one regularly.

**Taking a backup.** Settings → **Backup** → **Download backup**.
One JSON file, a few hundred KB, holding every table: readings, credit slips,
the ledger, customers, deliveries, dips, expenses, banking, the safe, assets,
rates, tanks and nozzles. Keep it somewhere that is not this Supabase account.

Two things are deliberately **not** in it:

- **The activity log's rows.** It is the largest table, nothing depends on it,
  and it answers "what happened last week" rather than "what are the books".
  The table and its trigger come from migration 035 like everything else, so a
  restored project starts writing new lines from its first save.
- **The logins.** A profile row is half of a login; the other half is in
  `auth.users`, and passwords are hashes no API hands out. The names and roles
  ARE in the file, so you know which logins to remake.

**Restoring into a new project**, in order:

1. Make the new Supabase project and apply every migration in
   `supabase/migrations/` **in order** — see the note in "If you are porting
   this off Supabase" about 049 depending on the definitions before it.
2. Recreate the logins (Authentication → Users), **typing the names exactly as
   the backup lists them**. That is what puts each entry back under the person
   who made it; the script matches by name.
3. Run the restore:

   ```bash
   node scripts/restore-backup.mjs --file pump-backup-2026-08-23.json \
     --url https://<new-ref>.supabase.co --key <service-role-key>
   ```

   It prints which authors it matched, asks before it loads anything, and then
   checks what landed: every table's row count and eight money totals
   recomputed from the live database and compared against the file. It exits
   non-zero if anything disagrees. A name with no login here is not fatal —
   those entries are restored with nobody against them, and `--map "Name=<uuid>"`
   points them at a login instead.
4. Point the app at the new project (`NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` in Vercel) and
   open it.

**The restore only ever loads into an empty project.** It does not merge and it
does not overwrite: if the target already holds trading data it refuses and
names the tables. What the migrations themselves seed — the two tanks, the six
nozzles, and the 36 treasury movements from 045 — does not count as data and is
replaced by the file's own copy.

**Why the loading is a database function** (`restore_everything`, migration
051) rather than a loop over the REST API: this schema is not a passive store.
A credit slip auto-posts its own ledger entry, so a naive reload would double
every customer's balance; stock is recalculated per row; readings may not
overlap and a day must balance, which is true of the finished data but not
necessarily half way through loading it. The function turns user triggers off
for one transaction, loads parents before children, turns them back on, and
recomputes the two derived stock figures itself.

**Try it once before you need it.** Make a throwaway Supabase project, restore
a real backup into it, check a few figures against the live app, then delete
the project. A backup nobody has ever restored is a guess.

**What has and has not been proved, as of migration 051.** The round trip was
run for real against a LOCAL Postgres with all 51 migrations applied: seed
through the normal path, export, wipe, rebuild from the migrations, restore, and
diff every row count, money total, customer balance, stock figure and trigger
state — identical, both through the database function and through the script.
The script's own HTTP path ran against a small stand-in for PostgREST rather
than the real thing, because Docker Hub was unreachable from the machine that
built it. **A rehearsal against a real Supabase project has not been done yet.**
When it is, the things most likely to differ from the local run are the ones
Supabase owns rather than Postgres: whether `service_role` reaches
`restore_everything` through PostgREST as the role check expects, whether a
payload of a few hundred KB goes through the RPC endpoint unaltered, and the
`auth.users` half of remaking the logins. Record the result here.

**Since 051, and the rule it leaves for every later migration.** The restore
writes each table's columns by name, so a backup taken before a column existed
hands that column null. Every column added since (056's service window, 063's
`corrects_entry_id`, 065's `is_main`) is nullable, so a backup from before any
of them still loads; 065's own test restored accounts from rows taken before
it. **A column added to a table the backup covers must be nullable too**, or
every older backup stops restoring, and nothing will say so until the day one
is needed.

## Database migrations

Applied in order:

| File | What it does |
|---|---|
| `001_core_schema.sql` | Enums, tables, constraints, indexes |
| `002_functions_and_triggers.sql` | Role helpers, stock maths, ledger auto-post, append-only guard |
| `003_rls_policies.sql` | Row Level Security for both roles |
| `004_seed_tanks_and_nozzles.sql` | The 2 tanks and 6 nozzles |
| `005_reporting_rpcs.sql` | Aggregate reporting functions |
| `006_lock_down_function_grants.sql` | Revokes the default PUBLIC execute grant |
| `007_reading_sheet_rpc.sql` | The daily reading screen, in one query |
| `008_pump_timezone.sql` | `pump_today()` - the database's idea of today, pinned to the pump |
| `009_reading_chain_context.sql` | Returns the neighbouring readings, so a broken chain can be flagged before saving |
| `010_month_export_rpc.sql` | Everything the monthly Excel workbook needs, in one call |
| `011_delete_staff_account.sql` | Lets a login be deleted, not just switched off |
| `012_nozzle_starting_reading.sql` | Where each meter stood when the pump joined the app |
| `013_correct_nozzle_fuel_layout.sql` | Unit 1 diesel, units 2 and 3 petrol - corrects 004's guess |
| `014_clear_day_and_reset.sql` | Clear one day; empty the books (testing only) |
| `015_delete_reading_reverses_slips.sql` | Deleting a reading posts offsetting ledger entries |
| `016_reset_all_data_safeupdate.sql` | Satisfies the WHERE-clause guard when emptying |
| `017_tank_opening_stock_within_capacity.sql` | A tank cannot be given more than it holds |
| `018_bank_accounts.sql` | Bank accounts, deposits, payments, 60-row retention |
| `019_month_export_with_banking.sql` | Adds the bank movements to the export |
| `020_bank_no_overdraw.sql` | Money out may not exceed money there is |
| `021_bank_split_payments.sql` | Per-account zero floor; one payment across several accounts |
| `022_set_nozzle_wiring.sql` | All six nozzles saved in one UPDATE |
| `023_purchase_total_is_the_input.sql` | Invoice total stored; rate per litre generated from it |
| `024_lubricants.sql` | The lubricant shelf: products, purchases, counter sales, credit to the ledger |
| `025_lubricants_in_reports.sql` | Lubricants in the dashboard, the trend, the monthly report and the export |
| `026_readings_may_not_overlap.sql` | A nozzle's readings may not overlap: two rows cannot cover the same litres |
| `027_no_backfill_without_room.sql` | And a day the next reading already covers whole cannot be entered at all |
| `028_loose_oil.sql` | Loose oil: a drum sold by the rupee, and litres to three decimals |
| `029_lubricant_trend.sql` | A day-by-day series for the shelf and the drum, for the dashboard chart |
| `030_loose_oil_in_the_export.sql` | The workbook's loose oil split and its Kind column |
| `031_remove_a_customer.sql` | Removing a customer: delete if never traded, retire if not, never while owing |
| `032_ledger_in_whole_rupees.sql` | The removal guard rounds to the rupee, matching the ledger |
| `033_purge_a_mistyped_customer.sql` | Deleting a customer for good, but only one that never traded |
| `034_customer_opening_balance.sql` | Creating a customer and the balance they arrive with, in one transaction |
| `035_activity_log.sql` | The audit trail: a trigger on sixteen tables writing who changed what, and an append-only log to hold it |
| `036_company_assets.sql` | Company Assets: what the pump has bought and kept, owner-only, extends the activity-log trigger to a seventeenth table |
| `037_reading_completion_by_date.sql` | How many nozzles were read on each recent day, for the Readings page's day strip |
| `038_drop_reading_completion.sql` | Drops 037 again — the day strip it fed was removed; the gap warning that replaced it needs no new query |
| `039_dip_belongs_to_the_day_it_closes.sql` | A dip is a moment, not a day: `taken` + generated `books_date`, so a morning dip closes yesterday. And `expected_stock` recalculated from history by trigger instead of frozen at insert |
| `040_company_assets_in_the_export.sql` | Company Assets reach the monthly workbook: the whole register plus the month's own purchases |
| `041_stock_register.sql` | The Daily Sale & Stock Register — a day-by-day row per tank with sales and gain/loss accumulated across a chosen run of days — and profit over an arbitrary run of days rather than a whole month |
| `042_customer_phone_on_the_list.sql` | `get_customer_balances` and `get_retired_customers` return `phone`. No schema change — the column has existed since 001 and the dialog always wrote to it; nothing ever read it back |
| `043_lubricant_trend_cash_and_credit.sql` | `get_lubricant_trend` returns the per-day cash/credit split. No schema change — `lubricant_sales` has carried both columns since 024 |
| `044_treasury.sql` | Treasury: the cash in the safe on site. `treasury_entries` ordered by `(entry_date, seq)`, a `treasury_ledger` view carrying the running balance as a window function, a **deferred** constraint trigger refusing anything that drives that balance below zero at any point in the chain, one-opening-entry and category-fits-direction constraints, owner-only RLS, and an eighteenth table on the activity-log trigger |
| `045_treasury_opening_entries.sql` | The owner's Tajori sheet as it stood on 21 Aug 2026 — 36 movements over eight days, closing at Rs 8,364. Asserts that total at the end and rolls itself back if the rows do not add up to it |
| `046_treasury_series_ends_at_the_last_entry.sql` | The treasury chart stops where the entries stop. 044 ran the window to `pump_today()` and carried the balance forward into it, drawing a flat tail across days nothing had been written down for yet |
| `047_treasury_a_page_is_a_day.sql` | `treasury_day()` — one day of the sheet per page, addressed by date rather than page number, with the day's own opening and closing and the neighbouring days that HAVE entries, so paging skips days with nothing on them and never lands on an empty page |
| `048_treasury_in_the_activity_log.sql` | Repair: 044 wires `treasury_entries` into the activity log and the copy applied to the live project did not include that half, so cash moving in and out of the safe went unlogged there. Found by checking a number in this file against `pg_trigger` before updating it |
| `049_profit_counts_stock_sold.sql` | **Profit was counting stock bought instead of stock sold.** `cost_of_goods_sold()` = opening stock + purchases − closing stock, with stock valued at the weighted average cost of the deliveries it is actually made of; wired into all three reporting RPCs |
| `050_clear_the_old_activity_log.sql` | The owner may throw away the OLD end of the audit trail — whole retention periods only (a month, three, six or a year kept), the cutoff computed from `pump_today()`, the recent end never touched, and the trim logged into the log it trimmed. Append-only is intact: no line may be edited, and no single line may be picked out |
| `051_backup_and_restore.sql` | **Backup and restore.** `export_everything()` — the whole book as one JSON document, owner only, minus the activity log's rows and the profiles. `restore_everything()` — loads one into an EMPTY project with user triggers off, parents before children, `created_by` remapped onto the new project's logins and stock recomputed; service-role only, never callable from the app. Driven by `scripts/restore-backup.mjs` |
| `052_the_database_works_out_the_cash.sql` | **A reading would not save.** 197.75 L x Rs 371.90 is exactly Rs 73,543.2250 — Postgres rounds the half-paisa to .23, JavaScript's binary double to .22, and the balanced-day constraint refused the row by one paisa on figures that were all correct. `create_nozzle_reading()` now DERIVES the cash in `numeric`, as it already derived the credit total, so the app cannot disagree with the constraint. `p_cash` is accepted and ignored |
| `053_expense_recovery_rows.sql` | **Partial reimbursements against an expense.** `expenses.amount` relaxed from `check (amount > 0)` to `check (amount <> 0)`, so a reimbursement (a neighbour repaying his share of a shared electricity bill, paid one instalment at a time) can be stored as a second row in the same shape — same category, dated when the cash actually comes back, amount negative. No new table: every RPC that already sums `expenses.amount` nets it out automatically |
| `054_lifetime_fuel_totals.sql` | `get_daily_summary()` gains `lifetime_by_fuel_type` — litres sold per fuel across every reading ever saved, not just the day on screen. Folded into the existing function rather than a new RPC, since the Dashboard already calls it once per render and the figure does not depend on the date shown |
| `055_month_to_date_fuel_totals.sql` | Replaces 054's `lifetime_by_fuel_type` with `month_by_fuel_type` — the wrong window had been built; what was wanted was the running month, not the pump's whole history. Scoped to the calendar month `p_date` falls in, from the 1st through `p_date` itself, matching how every other window on this page ends on the day shown rather than on today |
| `056_replacing_a_damaged_unit.sql` | **A unit was damaged and swapped for another one.** Nozzles gain a service window (`commissioned_on`, `retired_on`, `replaced_by`); `unique (unit_number, nozzle_label)` becomes a unique index over LIVE nozzles only, so the replacement keeps standing as Unit 1; a trigger refuses any reading dated outside the days its nozzle was actually on the forecourt; `get_reading_sheet()` filters by that window rather than by `is_active`, because the sheet asks about a DATE and `is_active` is a fact about today; `replace_unit()` retires the old nozzles and fits the new ones in one statement; and `set_nozzle_wiring()` now refuses a retired nozzle, whose tank decides which tank months of past sales came out of |
| `057_replaced_units_in_the_activity_log.sql` | The audit trail's one-line summary for a nozzle carries its service window, so the four lines a replacement writes say *when* — "Unit 1 · Nozzle A · replaced 12 Aug 2026". `trg_write_activity()` reproduced whole, as in 048, since a plpgsql body cannot be patched one branch at a time |
| `058_rearranging_the_forecourt.sql` | **The unit number and nozzle label become editable.** Rearranging the pumps is a rename, not a hardware event, so it belongs in Edit nozzle wiring — but a rearrangement is almost always a SWAP, which passes through a moment where two nozzles claim one position. `nozzles_live_unit_label_idx` (056) is therefore replaced by a **deferrable exclusion constraint** over the service window: no two nozzles may share a unit number and label over overlapping days, checked once at the end of the statement rather than row by row. Strictly stronger than the index it replaces, which said nothing about the past. `set_nozzle_wiring()` writes the two new fields, forces the deferred check so a clash comes back as a sentence, and still refuses to rewire a replaced nozzle's tank or meter — only its caption |
| `059_stock_is_valued_at_what_the_tank_holds.sql` | **Profit was charging each month-end's stock loss to the following month.** September 2026 had nothing in it and still showed a Rs 9,585 loss — the two sides of the 31 August dip. `stock_value_at()` valued stock through `calculate_expected_stock()`, which deliberately ignores a dip closing the day being asked about; that exclusion is right for a gain/loss (the dip is the thing being compared) and wrong for a valuation (the dip is the best knowledge of what is in the tank). New `tank_stock_on_hand()` — the same function with `books_date <= p_date` — answers the valuation question, and `tank_stock_value()` uses it. `get_monthly_report` and `get_month_export` have their `closing_litres` patched to match, so the litres table cannot disagree with the value printed above it. `calculate_expected_stock()` is untouched |
| `060_a_traded_nozzle_keeps_its_tank.sql` | **A dropdown moved a month of August into the wrong tank.** `nozzles.tank_id` carries no date and decides which tank every litre a nozzle ever sold came out of, so re-pointing the pump that had been trading all August as petrol turned 19,293 L of it into diesel the moment it was saved. 056 had already frozen `tank_id` on a RETIRED nozzle and written down this exact reason; the argument was always about the readings, never the retirement. `set_nozzle_wiring()` now refuses a tank change on any nozzle that has a reading against it, and names "Replace this unit" in the message — the rule 012 already applies to `starting_reading`: settable until the first saved day, history after it |
| `061_unit_1_changed_fuel_on_1_september.sql` | **One-off repair of the above, said as what happened rather than by undoing a field.** The moved pump goes back onto petrol and is retired 31 Aug; two new Unit 1 nozzles are fitted on diesel from 1 Sep with `starting_reading` at each meter's 31 August closing (48,760.78 and 24,835.72, not 0 — only the fuel behind the meter changed), linked by `replaced_by`. `replace_unit()` in every respect except that the hardware did not change, which the books do not care about: a nozzle row IS "a meter, drawing from a tank, over a span of days". Idempotent, and it refuses rather than guesses if the pump is not in the state it describes |
| `062_august_keeps_the_numbers_august_had.sql` | The 1 Sep renumbering had applied to every day each pump had traded, leaving August captioned as the mirror image of the forecourt that stood there. Possible to fix only because 061 split the moved pump into two rows: its position changed on the same date its fuel did, so there was finally somewhere to put both answers. A relabel of rows that already carry the right dates — one DO block, because a straight swap passes through a moment where two rows claim Unit 1 and `nozzles_one_pump_per_position` is deferred |
| `063_correcting_a_ledger_entry.sql` | **An "edit" button for a ledger that cannot be edited.** `correct_ledger_entry()` posts a reversal — same amount, same date, opposite direction, so every balance from the mistake onward is right again and not merely today's — plus a replacement unless the entry should never have existed, both in one statement (a reversal without its replacement silently wipes a real payment). `corrects_entry_id` is what makes the result readable: without it the ledger grows three rows of the same amount and nothing says which cancels which. A unique partial index enforces one cancellation per entry. Refuses a row posted from a reading or a lubricant sale, a row already cancelled, and a cancellation itself. Owner only |
| `064_the_ledger_carries_its_own_balance.sql` | **Every ledger row learns what was owed after it.** `get_ledger_entries_page()` and `get_ledger_entries_for_statement()` both carry `balance_after`, summed with a window function over the customer's WHOLE ledger and paged afterwards, so a row reads the same on whichever page it falls. Fixes a Balance column that restarted at zero on every page of 25 and printed Rs −59,728 against the newest entry of a customer owing Rs 97,515. Ordered by `entry_date, created_at, id` because a correction writes two rows in one statement and shares their timestamp. The paged call also returns the row count and every cancelled entry's id, replacing two queries and a batching loop |
| `065_a_main_bank_account.sql` | **One bank account can be the main one**, and the money in / money out form on Banking starts on it. `bank_accounts.is_main` (nullable on purpose: `restore_everything()` writes every column by name, so NOT NULL would refuse every backup taken before this column existed), a unique partial index allowing only one, `is_main` added as the last column of `bank_account_balances`, and `set_main_bank_account()`, which clears the old main before setting the new one inside one transaction. Owner only. Nothing already in the books changes |
| `066_a_backdated_price_reprices_its_days.sql` | **A price dated back to a day already entered re-prices that day's readings.** `set_fuel_price()` and `remove_fuel_price()` save or remove a price and call `reprice_readings_for_span()` in the same transaction: readings of that fuel from the price's date up to the next price's date move onto the rate now in force (`rate_per_litre` and `cash_amount` together; credit untouched). Owner only. Returns what moved, which the app turns into a sentence. |
| `067_suppliers_and_what_the_pump_owes_them.sql` | **An account for each supplier.** `suppliers` and an append-only `supplier_ledger_entries` (owe_more / owe_less: purchase, payment, discount, adjustment, reversal). Both purchase tables gain a nullable `supplier_id`; a delivery with one posts its invoice amount by trigger and deleting it posts a reversal. `record_supplier_payment()` also takes the money out of the safe (Treasury 'supplier') or a bank account in the same transaction; `record_supplier_entry()` for discounts and adjustments; `cancel_supplier_entry()` reverses one and puts a payment's money back. Owner only; names readable by staff. In the backup (and seeded, so cleared before a load), the reset and the activity log. Four placeholder suppliers at zero. |
| `068_month_end_stock_by_fuel.sql` | **The stock at a month's close, per fuel, with its rate.** `get_month_end_stock(year, month)`: litres, value at cost (the figure profit uses), cost rate, pump price and value at it, at the month's close and its opening, with totals from `stock_totals()`. Read only; shown on the Dashboard and Reports |
| `069_stock_at_lower_of_cost_or_pump_price.sql` | **Stock at the lower of cost and the pump price.** `tank_stock_value()` = least(`tank_stock_cost_value()`, litres x `fuel_rate_on()`), so a price cut below cost is a loss in the month it happens. Every stock valuation, and so profit, takes it; no past month changed |
| `070_bank_keeps_every_entry.sql` | **Banking keeps every entry.** Drops 018's 60-per-account trim trigger; the amounts it already removed stay in `pruned_*`, so no balance moves. The Banking page pages in Postgres |
| `071_opening_balance_entry_type.sql` | **A customer's opening balance saves again.** 034's `create_customer_with_opening()` wrote the entry type as text into the `ledger_entry_type` enum, so every opening amount was refused (and, one transaction, the customer with it). One cast; nothing else changes and no row is touched |
| `072_close_internal_functions.sql` | **Internal functions closed to outside callers.** `cost_of_goods_sold`, `stock_value_at` and `lubricant_stock_value` answered the public (anon) key; seven helpers answered any staff login. 049's `revoke ... from public` missed Supabase's own grants to `anon`/`authenticated`. Every caller is a definer function, so nothing in the app changes. No row touched |
| `800_owner_sets_up_the_forecourt.sql` | **Al Hakeem only.** The owner adds his own tanks (`add_tank`: either fuel, any number, size and opening stock) and nozzles (`add_nozzle`: unit, name, tank, starting meter, and a first day once trading has begun), and removes a tank or nozzle that has never been used (`remove_tank`, `remove_nozzle`). Owner only; plain-language refusals for a duplicate name, a clashing position (checked up front, since `nozzles_one_pump_per_position` is deferred), a tank in use and a nozzle with readings. `supabase/setup/start-empty.sql` clears the master's seeded tanks, nozzles and placeholder suppliers on a new database. |
| `801_customer_vehicles.sql` | **Al Hakeem first, to be ported.** One account, many vehicles: `customer_vehicles` (a number is active on one account at a time, matched without case, spaces or dashes by `vehicle_key()`), and a nullable `vehicle_id` on credit slips, oil sales and the ledger entries they post. A trigger refuses a vehicle that is not on the slip's account or has been removed. `get_customer_vehicle_totals()` sums what each vehicle took, in Postgres. `remove_customer_vehicle()` deletes an unused vehicle and retires a used one; `restore_customer_vehicle()` brings it back. The old vehicle box on a customer joins the list (backfilled). One credit limit and one balance per account, no drivers. The table is in the backup and the activity log. |

All reporting is done as Postgres aggregate RPCs rather than in the browser, so
the numbers are fast and cannot be altered client-side.

---

## Things worth knowing

- **Replacing a damaged unit.** **Settings → Dispensing units → Replace this
  unit.** A dispenser that is damaged and swapped is not the same object any
  more, and neither are its meters — so the replacement gets *new nozzles*,
  starting wherever its meters actually start (0 for a brand new one), and the
  old nozzles keep every reading they ever took. Nothing in the books changes:
  the old rows still hold their litres, cash, credit and tank movement, and
  their days can still be opened and corrected on Readings. What changes is
  which pump is offered for entry on which date.

  Give it two dates: the **last day the old unit dispensed** and the **first
  day the new one did**. They may be the same day — a unit swapped over one
  morning sold on both — and that day shows both pumps on the reading sheet,
  labelled *being replaced today* and *the new unit*. Leave days between them
  and those days simply have no such unit to enter, which is right if it stood
  out of service.

  **Do not try to do this by editing the starting reading.** A starting reading
  is only consulted until a nozzle has its first saved reading (migration 012),
  so on a nozzle that has been trading it is dead data — setting it to 0 changes
  nothing, and the day you then try to enter opening at 0 is refused for running
  the meter backwards.

- **Rearranging the pumps.** **Settings → Edit nozzle wiring** — the unit number
  and nozzle label are editable there, so the app can be made to match how the
  forecourt is actually laid out. A rename applies to the **whole history**: the
  pump shows under its new number on days already entered too. That is right for
  a rearrangement, where your own mental map has moved with the hardware; it is
  the wrong tool for a pump that was genuinely swapped out, which is what
  **Replace this unit** is for. The two are often used together — rename first
  so the position you want is free, then replace.

- **Nozzle wiring.** Unit 1 runs both nozzles on diesel; units 2 and 3 run both
  on petrol. Migration 004 originally guessed one of each per unit and 013
  corrects it. Change it under **Settings → Edit nozzle wiring**, which also
  holds each nozzle's starting meter reading — no migration needed. The tank
  decides which stock a sale draws down, so a wrong one silently empties the
  wrong tank.
- **Starting meter readings matter on day one.** A pump that has been trading
  has meters reading hundreds of thousands of litres when it goes onto this
  app. Set them before entering the first day, or that day books the meter's
  whole lifetime as one day of sales.
- **A delivery is entered by its invoice total, not its rate per litre.** The
  note states litres and an amount payable; the amount is what leaves the bank
  and what profit is computed from, so it is stored as typed and the rate is
  generated from it. The rate is held to 4 decimals and shown to 2, so a row can
  read 20,000 L at Rs 240.00 totalling Rs 4,800,010 and not multiply out - the
  total is the record, the rate is derived.
- **A fuel rate can be removed** under Settings. One rate per fuel per date is
  enforced by a unique constraint, so a mistyped rate cannot be corrected by
  saving over the top.
- **A reading keeps a copy of its rate, and a backdated price re-prices it**
  (migration 066). The copy (`rate_per_litre`) is what stops a price set today
  rewriting last week. But a price dated back to a day already entered is the
  owner saying what that day's price was, so `set_fuel_price()` saves it and
  re-prices the readings in the span it governs (its date up to the next
  price's date) in one transaction; `remove_fuel_price()` does the same the
  other way, onto the price before it. Only `rate_per_litre` and
  `cash_amount` change (credit is the slips'), each update is in the activity
  log, and the answer on screen names the days and the before and after
  totals. Why: four times (14 Aug, 25 Aug, 12 Sep, 26-27 Sep 2026) a day's
  readings were saved before that morning's new price was set, and stayed on
  the old one. Readings also warns while a fuel's rate is carried over from an
  earlier day, before anything is saved.
- **Shifts.** Readings are recorded once per nozzle per day. The `shift` column
  already accepts `day` and `night`, so splitting the day later is a UI change,
  not a data migration.
- **The app runs in Singapore (`sin1`), next to the database.** `vercel.json`
  pins it, and the reason is worth keeping: the functions were defaulting to
  `iad1` (Washington DC) while the Supabase project sits in `ap-southeast-1`.
  That put the Pacific between the app and its own data, so a page making two
  or three queries paid roughly 230ms *per query*, plus another 230ms getting
  the request from Pakistan to Virginia in the first place. Co-locating with
  the database matters more than sitting closer to the reader, because one
  navigation makes one user round trip and several database ones. If the
  database is ever moved, move this with it. (Hobby plan allows one region; the
  same setting lives in Vercel under Settings → Functions.)
- **The business day is pinned to `Asia/Karachi`**, in `app/_lib/date-helpers.js`.
  It is deliberately *not* taken from the machine's clock: the browser sits in
  Pakistan but a Vercel server runs in UTC, so between midnight and 5am the two
  would disagree and entries would be filed against the previous day. Change the
  one `PUMP_TIMEZONE` line if the pump ever moves.
- **Number grouping** is `140,000` style. For the lakh style (`1,40,000`), change
  `'en-US'` to `'en-IN'` in the two formatters in `app/_lib/helpers.js`.
- **The customer ledger is in whole rupees**, because Pakistan has no coin below
  one. A credit slip is litres × rate, which produced debts like Rs 3,734.28 —
  the customer paid the Rs 3,734 he was asked for and 28 paisa stayed on his
  account for ever, since no payment can clear it. `roundRupees` is now applied
  to every ledger write (credit slips, payments, adjustments, lubricant sales).
  The **meter arithmetic keeps its paisa**: `sale_amount` is litres × rate and
  rounding it would put a day's takings out of step with the litres behind
  them. Where a whole-rupee credit comes out of a fractional sale, the
  difference lands on the cash side — which is right, cash being the residual
  and counted in notes.
- **Lubricant stock is always in litres**, whether it leaves as a sealed 4 litre
  carton or as 30 rupees' worth poured out of a drum. A purchase is entered in
  litres too: twelve 4 litre cartons is 48, and the form does that
  multiplication in front of you rather than letting 12 be typed.
- **There are two kinds of lubricant, and the product says which.** A product
  carries a `sold_loose` flag, and it decides which number the sale form asks
  for:
  - **Sealed packs** — type the litres; the amount is prefilled from the rate.
    The pack size is a one-tap shortcut into the litres box.
  - **Loose oil** — a drum, bought from a supplier the way fuel is, with no
    brand on it. Type the **rupees**; the litres are worked out from the drum's
    rate and are never accepted from the browser. Recorded on its own page,
    `/admin/lubricants/loose`, because a long run of Rs 20 and Rs 50 pours
    reads nothing like a handful of carton sales and each buried the other.

  Everything downstream treats a drum as an ordinary lubricant — the same stock
  triggers, the same customer ledger, the same monthly report line — so the flag
  changes the *entry*, not the accounting.
- **Loose oil litres carry three decimals.** Rs 20 out of a drum priced at
  Rs 580 a litre is 0.0345 L, which at two decimals is 0.03 — a tenth of every
  pour lost, always in the same direction, on the kind of sale that happens
  dozens of times a day. The drum's book level is therefore only as good as its
  rate: if the level here drifts from the level in the shed, the rate is the
  first thing to check.
- **Removing a lubricant means one of two things, and the database picks.** A
  product never bought or sold is deleted outright — it was a typo. One with
  history is *retired*: it stops appearing on the sale form, its past sales and
  purchases keep counting in every month they belong to, and its name is
  released so a replacement brand can reuse it. Retired products stay listed
  under **Manage lubricants** with a **Bring back** button.
- **Monthly profit** counts stock *bought* in the month — fuel and lubricants
  alike — not stock sold from the tank or the shelf. A big delivery near month
  end makes profit look low — that money is sitting in stock, which is what the
  closing stock figures show.
- **Banking keeps every transaction** (since migration 070). Until then it kept
  only the last 60 per account, folding each removed amount into
  `pruned_deposits` / `pruned_payments` so the balance stayed exact; those
  folded totals are still part of every balance. The monthly Excel's `Bank`
  sheet remains the month's bank record on paper.
- **No account may go below zero.** A payment larger than the account it is paid
  from is refused by a trigger — per account, not across the total.
- **A payment too big for one account can be split across others.** The owner
  ticks which accounts cover the rest; they are drawn on in the order he ticks
  them, chosen account first, each down to what it holds. That is one payment
  written as several rows, so it goes through `record_bank_payment()` rather
  than a loop in the app: several inserts that are really one payment must land
  together or not at all, and only the database can promise that. **The split is
  computed in the RPC from real balances, never from what the browser posted** —
  the form works out the same allocation while you type, but only to show you.
- Deletes are deliberately *not* checked: deleting a transaction is how a
  mistake gets corrected, and blocking a correction because the books are
  already wrong would trap you. So a correction can still leave an account
  negative — that shows in red on its card with a note saying how to fix it, and
  payments out of it are refused until it is back to zero.
- **Bank movements are not profit.** Paying cash into the bank is not income and
  transferring it out is not a cost — the sale and the expense were already
  counted when they happened. That is why the Summary sheet keeps them in their
  own `BANK` block instead of under `COSTS`, where they would count twice.
- **Company assets are not profit either**, for the same reason bank movements
  are not: the pump spent money and still has the thing. The Summary sheet keeps
  them in their own `COMPANY ASSETS` block with a line saying so, because a
  figure on that sheet without the sentence is one somebody subtracts by hand.
- **The Assets sheet is the only one that ignores the report's month.** It
  carries the whole register with a "Bought this month" column, rather than only
  that month's purchases. An asset register answers *what does the business
  own*, and most months the pump buys nothing — a month-scoped sheet would be
  empty in those months and read as a bug rather than as a fact.
- **Adding a sheet to the Excel template**: the app addresses sheets by file name
  (`sheet1.xml`, `sheet2.xml`, …), and openpyxl numbers them in creation order.
  Always `create_sheet` a new one **last** in `scripts/build-report-template.py`,
  or every sheet after the insertion point is silently renumbered and the app
  starts rewriting the wrong ones.
