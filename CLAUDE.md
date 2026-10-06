# Working in this repo

> **This is a client copy: Al Hakeem Filling Station PSO.** The master copy of
> the app is `Ammar-Sagheer/Petrol-Pump-Management-Software`; fixes and features
> are made there first and copied here, migrations keep the master's numbers,
> and this repo's own differences are only:
>
> - `app/_lib/brand.js` (the name), `public/logo.png` (the PSO mark he
>   supplied, already transparent, cropped to the circle, 300px), and
>   `app/icon.png`, `app/apple-icon.png`, `app/favicon.ico` made from it by
>   `scripts/build-icons.py`.
> - `vercel.json` runs his server in `bom1` (Mumbai), beside his Supabase
>   project in ap-south-1; the master runs in `sin1`.
> - `supabase/migrations/045_*` is empty: the master's 045 holds another pump's
>   safe sheet and must never be copied here.
> - **He sets up his own forecourt** (migration 800, this repo only): the
>   database starts with no tanks and no nozzles; the owner adds tanks and
>   nozzles himself, as many as he wants, under Settings, and the Dashboard
>   shows a setup checklist until there is a tank, a nozzle and a price.
>   `supabase/setup/start-empty.sql` removes the master's seeded tanks,
>   nozzles and placeholder suppliers on a new database.
> - The backup panel shows only when the Vercel env var `SHOW_BACKUP=true`.
>
> The rest of this file, `README.md` and `docs/` describe the master app and its
> history (including the first pump's), and hold for this one too. The master
> assumes one petrol and one diesel tank in places its migrations seed; nothing
> it computes depends on that, but render the stock and report pages with two
> tanks of one fuel after any change that touches them.


Daily management software for a petrol pump: nozzle readings, fuel purchases,
stock gain/loss, customer credit, banking, and monthly profit. Next.js (App
Router, plain JavaScript), Tailwind CSS v4, Supabase (Postgres + RLS + Auth).
One real user: the owner, and the staff he creates logins for.

Read these before making changes, in this order:

1. **`README.md`** — the business logic. Roles, the daily routine, what the
   database enforces and why, how stock is calculated, project layout,
   migrations. This is the ground truth for *what the app does*.
2. **`docs/UI_CONVENTIONS.md`** — the design system and recurring patterns
   (dialogs, tables, forms, colors, layout grids) established over many
   rounds of UI work. Follow these rather than inventing new ones; a new
   pattern should be a deliberate choice, not an accident of not knowing the
   existing one.
3. **`docs/CHANGELOG.md`** — what has been built and changed, in order, with
   the reasoning behind each change. Read this to understand *why* the
   current UI looks the way it does before changing it again — several
   things here look like they could be simplified and were already tried
   that way and reverted for a reason written down at the time.

## Ground rules specific to this project

- **The database is the source of truth for correctness.** Money and stock
  rules (balanced days, append-only ledger, no negative accounts, tank
  capacity) are enforced by Postgres triggers and RLS, not just application
  code. If the app and the database ever disagree, the database is right —
  see "What the database will not let you do" in `README.md`. Don't
  re-implement these checks in the UI as the only guard; the UI check is a
  courtesy, the database constraint is the rule.
- **Never compute in JavaScript a money figure the database also computes.**
  Postgres works in exact `numeric`; JavaScript works in binary doubles, and on
  a half-paisa they disagree — 197.75 L × Rs 371.90 is exactly Rs 73,543.2250,
  which Postgres rounds to .23 and a double rounds to .22. That one paisa made
  a correct reading unsaveable against the balanced-day constraint, on and off,
  for weeks (migration 052). Derive the figure in Postgres and read it back;
  where a form must show it before saving, use `saleAmount()` in
  `format-helpers.js`, which multiplies as integers and rounds the way `numeric`
  does. A generated column plus a check constraint is a promise that both ends
  agree — a float is a wager that they will.
- **Forecourt equipment is dated, and the past is not editable through it.**
  Pumps get damaged, moved and re-piped — it happens at every filling station
  and it has happened twice here. A nozzle row is *"a meter, drawing from a
  tank, over a span of days"*, so a pump that changed **fuel** is a replacement
  exactly like a pump that changed **hardware**: both end one span and begin
  another. What it is never is a field edit. `tank_id` and `starting_reading`
  carry no date, so changing either after the nozzle has traded rewrites or
  silently ignores history — the database refuses the first and the UI greys out
  the second. The whole procedure, with the order to do things in, is
  `README.md` → "When a dispensing unit is damaged, moved or re-piped". Read it
  before touching `nozzles`.
- **A meter counts turns, not litres.** A dispenser cycled with empty lines
  still moves its dial; 157 L arrived that way on 1 Sep 2026. Any "meter starts
  at" figure is read off the machine, never inferred from the old pump's
  closing.
- **Every page under `/admin` goes through `requirePageRole()`** and every
  Server Action through `requireRole()` (`app/_lib/helpers.js`,
  `app/_lib/actions.js`). Hiding a nav link is cosmetic only — never rely on
  it as the actual access control.
- **The business day is pinned to `Asia/Karachi`**, not the server's clock.
  See `app/_lib/date-helpers.js` before touching anything date-related.
- **Business name and logo are data, not code.** `app/_lib/brand.js` and
  `public/logo.png` — see `README.md`.

## Backups, the live database, and the offline build

**Settings → Backup → Download backup** writes the whole database as one JSON
file; `scripts/restore-backup.mjs` plus `restore_everything()` (migration 051)
load one into an empty project. `README.md` → "Backups, and restoring from
one" is the procedure and what has been proved: the round trip comes back
byte-identical against a local Postgres, and a rehearsal against a real
Supabase project is not recorded yet. If one turns something up, fix
`restore_everything()` in a new migration (051 has run on the live database,
and a migration that has run is never edited) and record it in the changelog,
rather than working around it in the script.

- **A column added to a table the backup covers must be nullable.** The restore
  writes every column by name, so a backup from before the column existed
  hands it null, and NOT NULL would refuse the whole file. Every column added
  since 051 (056, 063, 065, 067) is nullable for this reason.
- **A naive reload is wrong twice over**, which is why the loading lives in
  Postgres: a credit slip auto-posts its own ledger entry (reload both and
  every balance doubles), and a freshly migrated project is not empty
  (004/012/013 seed the tanks and nozzles, 045 seeds 36 real treasury rows).
- **Find the live project by its ref, or by its data, before applying
  anything.** The connected Supabase account holds more than one project, and
  a migration once went to the wrong one (changelog → "A partial reimbursement
can be recorded against an expense"). Match the
  ref against `.env.local`, or, with no env file, a figure only the live books
  produce (a month's total off the owner's screenshot). Hash what the migration
  can reach before and after, and never change a row: these are real books.
- **The offline (Electron) build tracks this repo**
  (`Ammar-Sagheer/Offline-Petrol-Pump-Manager`). What it still has to take is
  one checklist at the bottom of `docs/CHANGELOG.md`: "Syncing the offline
  (Electron) build", pointed to from "Where things stand". When a change here
  adds a migration or a feature, add a row to that section in the same commit,
  so the next sync is a single read. The
  backup feature is not on that list: the desktop build backs itself up its
  own way (a data-directory copy or `pg_dump` also keeps the logins, which this
  export deliberately cannot).

## Verifying UI changes

This app is read by someone on a cheap tablet, in poor light, checking
numbers against cash in a drawer. A change that looks right in the DOM but
wraps a number across two lines, or reintroduces a scrollbar at a common
laptop width, is a real regression even though nothing "broke".

- **Never trust a DOM measurement alone.** A boolean like `hasScroll: false`
  can be numerically true while a screenshot shows the fix cost you cramped,
  wrapped text somewhere else. This has happened in this repo — see the
  Purchases-table entries in `docs/CHANGELOG.md`. Always render the change
  with realistic (not lorem-ipsum-short) data and look at it.
- **Playwright is set up and the browser is pre-installed** — do not run
  `playwright install`. Launch with an explicit `executablePath`; the browser
  lives under `/opt/pw-browsers/` (the versioned folder, e.g.
  `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, is what actually
  resolves; check the directory rather than assuming the unversioned path).
  Screenshot at more than one viewport width when a change touches layout (at
  minimum a small-laptop width like 1024–1152px and a phone width around
  400px); several bugs in this app's history only showed up at the narrow end.
- **The render check** is `node
  .claude/skills/small-business-ledger-app/scripts/render-check.mjs <url>
  <outdir> --widths 1366,1024,400,360,320`: a screenshot per width, and every
  element its own box clips. Expected in the list: `sr-only` labels, the top
  bar's truncated name, MUI `LinearProgress` bars, and the cells of a table
  that scrolls sideways. Anything else, and any clipped figure, is a bug.
- **A disposable `app/devcheck/page.js` route** is the established way to
  render a component or page layout with realistic fixture data for
  screenshotting, when logging in as a real user through Playwright is more
  friction than the check is worth. **Never commit this file or directory.**
  Delete it before every commit, and confirm with `git status --short` that
  it's gone before staging.
- Run `npm run build` before committing — it also runs the TypeScript check
  even though the app is plain JavaScript (JSDoc-driven checks in a few
  places), and it's the fastest way to catch a typo'd import.

## The shared pieces to reach for first

Every page wears the new look (September 2026): the owner asked for a complete
redesign of the Dashboard, then had the rest of the site brought into line with
it. Most of the look comes from a handful of shared things. Check these before
writing a new component or a new class:

- **`TitleHeader` / `DayHeader`** (`_components/admin/dashboard/`): the top of
  every page. `DayHeader` on a page about one day (the date said once, the
  arrows, the jump box); `TitleHeader` everywhere else, with `back` for a
  subpage.
- **`SectionHeader`**: the heading that opens each zone of a page, with its
  icon tile, one line on what the zone covers, and any control for it.
- **`KpiCard` / `KpiGrid`**: the headline figures. Takes `sub`, `alert`,
  `delta` (percent pill), `spark` + `sparkTips` (sparkline) and `tileClass`.
- **`Notice`**, **`FigureRow` / `FigureTile`**, **`FuelCard`**, **`TankGauge`**,
  **`TrendWindow`** and **`TrendCharts`**, in the same folder.
- **`.panel`, `.icon-tile`, `.caption`, `.seg*`, `.callout*`, `.figure-box`** at
  the end of `globals.css`, and `.fuel-band` for the loud fuel fills.
- **`Sparkline`** (`_components/ui/Sparkline.js`): decoration with a shape,
  never a figure to read. Its `tips` are formatted by the CALLER, on the server.
- **`DeltaBadge`** (`_components/ui/DeltaBadge.js`): the arrow is direction, the
  colour is whether it is good news. Pass `higherIsBetter: false` where a rise
  is bad.
- **`fuel-colors.js`** owns every fuel hue: `soft` (the quiet band a fuel wears
  where it is only read), `solid` (the loud one, where figures are typed or the
  rate is shown), `tint` (background only) and `raw` (the true hex, for the
  dot).

**`KpiCard`, `SectionHeader` and `.panel` are the app-wide blast radius**: a
change to any of them lands on nearly every page, so render more than the page
you are working on. `docs/UI_CONVENTIONS.md` -> "The new look" has the rules
and a note on each page as it was moved over.

**No em dashes in anything a person reads** (the owner's request, September
2026). Write a colon, a comma, brackets or a full stop instead; in the Urdu
guide, the Urdu comma or brackets. Text the database writes (the activity log,
Postgres's own refusals) still carries them, and goes through `withoutDashes()`
in `format-helpers.js` on its way to the screen. Code comments use a spaced
hyphen.

## Docs stay current

If a change introduces a new recurring pattern (a new shared component, a
new layout convention, a new class in `globals.css`), add it to
`docs/UI_CONVENTIONS.md` in the same commit. If it's a notable feature or a
non-obvious fix future work should know about, add an entry to
`docs/CHANGELOG.md`. A future session reads these instead of re-deriving
context from scratch — keep them worth reading.

## The skill in this repo

`.claude/skills/small-business-ledger-app/` loads automatically for work here.
It holds *how to work on a money app* (investigating live data before changing
it, testing a trigger without writing a row, the design language, the type and
colour floors); this file and `docs/` hold what is true of *this* app. It asks
who the app is for before designing anything (`SKILL.md` §0), and its
`references/ui-patterns.md` is the rule-shaped companion to
`docs/UI_CONVENTIONS.md`. Keep them in step: a new convention goes in
`docs/UI_CONVENTIONS.md` with the story, and into the skill as a rule if the
next ledger app would want it too.

**The kodexa-builder skill** (v1.4.0, built here on 27 Sep 2026 from v1.3.0) is
the studio's house playbook. Load it for any new feature or design work, and
log preferences, corrections and reversals to `.claude/kodexa-learnings.md` as
they happen. On money, stock and credit, the ledger skill above wins.
