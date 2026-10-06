---
name: small-business-ledger-app
description: Engineering discipline and design language for apps where one small business keeps its money — daily takings, stock, customer credit, cash reconciliation, monthly profit. Covers asking who the app is really for before designing anything, investigating live data before changing it, enforcing money rules in Postgres rather than the UI, testing schema changes without touching production rows, verifying screens by rendering them, and a settled set of UI patterns (dialogs for confirmations, pagination wherever data grows, container queries, colour never the only cue). Use whenever the work involves a ledger, daily readings or meter entry, stock or inventory counts, customer credit and payments, cash-vs-credit splits, invoices, or a monthly report — especially for Next.js App Router + Supabase apps with RLS and Tailwind, or any app whose numbers a real business checks against cash in a drawer. Also for investigating suspicious figures, duplicated or missing days, or balances that do not add up.
---

# Building the app a business keeps its money in

The person using this is not a customer of a SaaS product. They are one owner,
often with a couple of staff, who ran this business on paper for years and has
now been handed a screen. The app does not "support" their bookkeeping — it
*is* their bookkeeping. If a figure is wrong, they lose money and may not find
out for a month.

That changes what good work looks like. The disciplines below all follow from
it. Read them, then read the reference file for whatever you are actually
touching.

| Doing this | Read |
|---|---|
| Adding a constraint, trigger, or migration | `references/database-rules.md` |
| Changing any screen or layout | `references/verifying-ui.md` |
| Type, colour, spacing, number formatting | `references/readability.md` |
| Building or changing any screen | `references/ui-patterns.md` |

---

## 0. Ask who this is for, before you design anything

**This is the first question, every time, and it is not optional.** The
disciplines in this skill are constant; the *interface* they produce is not.
An app for a 60-year-old who kept a paper register for twenty years and an app
for a 25-year-old who has used a phone since school are different apps, and
guessing wrong makes one of them unusable.

Ask before writing markup, and ask plainly:

> Who will actually be using this day to day — roughly what age, how
> comfortable with phones and computers, and on what device? Is it the owner
> themselves, staff they hire, or both?

What the answer changes:

| | Older / less confident with screens | Younger / phone-native |
|---|---|---|
| Type scale | 16px body floor, 18px figures, 12px caption floor | 14px body is fine, denser tables |
| Rows per screen | fewer, taller, generous tap targets (48px) | more, 40px targets acceptable |
| Labels | full words, always visible | icons with tooltips are fine |
| Confirmations | in words, spelling out the consequence | a short confirm, or undo instead |
| Navigation | everything visible at once, no hidden menus | tabs, drawers, keyboard shortcuts |
| Density | one job per screen | dashboards, side-by-side panels |

Two things do **not** change with the audience, and never bend:

- **Money and quantities never wrap, truncate or clip**, at any size.
- **Colour is never the only carrier of meaning.** A 25-year-old can be
  red-green colourblind too.

If both audiences will use it — an owner in his sixties and an attendant in
his twenties, which is the common case — **design for the older one**. The
younger reader loses nothing to a 16px figure and a full-word label; the older
one loses the app entirely to 13px grey text.

Record the answer somewhere the next session will find it: a line in
`README.md` or `CLAUDE.md` saying who the reader is. Otherwise the question
gets asked again and answered differently, and the screens drift apart.

---

## 1. Find out what is true before you change anything

The strongest habit in this kind of work is refusing to reason from the
screenshot. A screenshot shows a symptom. The database holds the fact.

When something looks wrong — a badge on every row, a figure that seems too
large, a day that reads oddly — **query the real rows first**, and let the
answer decide what the bug is. Often the code is fine and the data records a
real mistake someone made. Sometimes the data is fine and the code is crying
wolf. You cannot tell which from the UI.

Two things this repeatedly buys you:

**You fix the actual bug.** A warning badge appearing on every row of every
past day looked like a styling problem. The query showed the data was
immaculate and the *condition* was too broad — it fired whenever any later
record existed, which is true of every past day the moment entry continues. No
amount of looking at the screen would have shown that.

**You find the thing nobody asked about.** While checking that badge, the same
query showed two days holding byte-identical meter spans — one day's takings on
the books twice. The user had not reported it and did not know. It was worth
more than the bug being investigated.

When you report findings, **show the rows**. A small table of real values with
a column saying which ones violate the rule is worth more than a paragraph, and
it lets the owner check your reasoning against what they remember doing.

**Correct a wrong premise, with evidence.** If the user says "only nozzle 4 was
wrong" and the data says all six overlap, say so plainly and show why. Being
agreeable here costs them money. Do it without drama: state what the data
shows, note which part of their belief holds, and move on.

---

## 2. Put the rule in the database

Anything that protects money belongs in Postgres — a `check` constraint, a
trigger, an RPC that validates before it writes. Application code is a
courtesy; it can be bypassed by a direct query, a second client, or a future
refactor that forgets.

**The error message is the user interface.** These messages surface to a
non-technical owner, often through a thin `describe()`-style mapper that passes
database text straight through. So write the exception the way you would write
a note to the owner: name the other date, quote both figures, say how many
litres or rupees are at stake, and say what to do next.

```
This day would overlap the reading already saved for 07 Aug 2026. That one
starts at 1987128.80, before this day closes at 1987279.95, so the same
151.15 litres would be counted on both days. Clear 07 Aug 2026 first, then
enter this day again.
```

Not `violates constraint readings_no_overlap`.

**Block what cannot be honest; warn about what merely looks odd.** A later
reading that starts *before* an earlier one finished is arithmetically
impossible — refuse it. A *gap* between two readings is a skipped day or a
replaced meter — real, sometimes unavoidable, so warn and let it through.
Blocking the second traps someone with no way forward, and an app that traps
its owner gets abandoned.

Watch for the case where a rule leaves exactly one legal value and that value is
a lie. Refusing overlaps still permitted a zero-quantity day where the next
record already covered the whole span — which records "nothing sold" for a day
that traded. Close that too.

Full patterns, and how to test a trigger without writing a row, in
`references/database-rules.md`.

---

## 3. Never disturb live data

This is someone's real business. Investigate with `select` only. Do not
"helpfully" correct rows, even when you are confident and the fix looks
trivial — you do not know which of two dates the meter was physically read on,
and they do.

**Testing a trigger against production is fine if the transaction cannot
commit.** Wrap the attempt in a block that deliberately raises at the end:

```sql
do $$
declare v_msg text;
begin
  begin
    update ...;                       -- the thing you expect to be refused
    v_msg := 'ALLOWED (should not be)';
  exception when others then
    v_msg := SQLERRM;                 -- capture what the rule actually said
  end;
  raise exception 'RESULT >> %', v_msg;   -- aborts, so the attempt rolls back
end $$;
```

You get the real message and the row is untouched. Confirm afterwards with a
count or a checksum, and say plainly in your summary that nothing was written.

**Dry-run a new constraint before applying it.** Query which existing rows
would violate it. If the answer is "six rows, all part of the problem we are
fixing", apply it. If it is "four hundred rows going back a year", the rule is
wrong or needs a grandfather clause — find out before you turn it on and lock
the owner out of their own history.

**Hand data corrections back.** Give the exact steps and figures, in order, and
let the owner do it in the app. They know things the database does not.

---

## 4. Render it and look at it

A DOM measurement can be true and the screen still wrong. `hasScroll: false` is
compatible with a number wrapping across two lines, a label truncating to
"Mubeen Petr...", or a column cut off entirely.

Use the bundled script rather than writing another one — every session
otherwise rewrites the same forty lines:

```bash
node scripts/render-check.mjs http://localhost:3000/devcheck ./shots
```

It screenshots at 1440 / 1152 / 1024 / 400 (add 360 and 320 when money figures
are on screen), and reports every element whose text its own box clips. Both
halves matter: the screenshots catch ugliness, the clipping report catches the
digit you would not have noticed missing.

The usual way to get realistic content on screen without logging in is a
disposable route — `app/devcheck/page.js` in Next.js — importing the *real*
components with fixture data that looks like the real thing. Long customer
names, seven-figure sums, a day with nothing entered. Lorem ipsum hides exactly
the bugs you are looking for.

**Delete it before every commit** and confirm with `git status --short`. It
imports server-only modules and would break the production build.

Screens change under you when the owner is using the app while you work. If a
verification result surprises you, re-check the data before concluding the code
is broken — twice in one session a "failing" test turned out to be the owner
fixing their own records mid-investigation.

Details and the clipping-report gotchas in `references/verifying-ui.md`.

---

## 5. Write for the person holding the tablet

Cheap tablet, pump office, evening light, checking a figure against notes in a
drawer. Two rules carry most of the value:

**The data is bigger than the chrome.** A figure someone verifies must never be
smaller than the label describing it, and never smaller than decorative
headings. Getting this backwards is the single most common failure.

**Never let a number wrap, truncate, or clip.** "Rs 4,386,211" breaking after
the "Rs" reads for a moment as two figures. Hold money on one line and let the
layout give way — drop to fewer columns, not fewer digits.

The type scale, contrast floors, icon rules and number-formatting conventions
are in `references/readability.md` — sized for the audience §0 asked about.
The settled component patterns (confirmations, pagination, filters, when a
table stops being a table) are in `references/ui-patterns.md`.

---

## The stack these patterns assume

Not mandatory, but every rule here was arrived at on this shape, and the
reasoning transfers more cleanly if you know what it was reasoned against.

| Layer | Choice | Why it matters to the rules above |
|---|---|---|
| Framework | **Next.js App Router**, plain JavaScript, no TypeScript | Server Components mean pages query at request time; there is no client data layer to cache, which is what makes offline a project rather than a flag |
| Data | **Supabase Postgres** with RLS | RLS *is* the access control; `requireRole()` in the app is defence in depth. Aggregation lives in RPCs so two screens cannot compute different answers |
| Mutations | **Server Actions**, each returning `{ ok, message }` | One shape for every form, so one `<FormMessage>` renders them all |
| Auth | Supabase Auth, **password only** | No magic links, no reset emails, no absolute URLs — which is why changing domain needs no code change |
| Styling | **Tailwind v4**, `@layer components` in one `globals.css` | v4's `@apply` cannot reference another custom class, so component classes are written out in full |
| Responsive | **Container queries** (`@container`, `@[50rem]:`) | A sidebar means viewport width and content width are different numbers; see `references/ui-patterns.md` |
| Components | **MUI**, themed to the same tokens, beside Tailwind | Its own styles outrank Tailwind's zero-specificity utilities (a `space-y` gap vanishes under a button), and its components validate their props: a share bar handed a negative value logs an error, so clamp anything computed |
| Charts | Recharts | |
| PDF | **pdf-lib**, the standard fonts only | No font to embed keeps a statement a few KB, but the standard fonts are WinAnsi and pdf-lib throws on anything outside it: scrub what a phone keyboard types |
| Excel | Direct XML manipulation of a template workbook | No server dependency, so it ports anywhere |
| Deploy | Vercel, region pinned beside the database | Co-locating functions with Postgres was worth more than any query tuning |

**Pin the region.** Functions in one continent and the database in another cost
a round trip on every query. Moving them together was the single largest
performance win in this project — larger than caching, prefetching or any query
change — and it was one line of config.

## Folder structure

```
app/
  layout.js, page.js
  admin/                   every authenticated screen
    layout.js              the auth shell - role check happens here
    <section>/             one folder per nav section
      page.js              Server Component: fetch, then lay out
      loading.js           skeleton, where the query is slow
  _components/
    ui/                    generic, knows nothing about the business
    admin/                 business-specific
  _lib/
    data-service.js        EVERY read query, server-only
    actions.js             EVERY Server Action
    helpers.js             role checks + re-exports; reads cookies, server-only
    date-helpers.js        safe on both sides - the business timezone lives here
    format-helpers.js      safe on both sides - money, rates, quantities
supabase/migrations/       numbered, applied in order, never edited after applying
docs/
  UI_CONVENTIONS.md        the design system, with the reasoning
  CHANGELOG.md             what changed and why, including what was reverted
```

Four rules that keep this honest:

- **`data-service.js` holds every read and `actions.js` every write.** A query
  written inline in a page is one nobody will find when the schema changes.
- **`helpers.js` reads request cookies, so it can never enter a client
  bundle.** That is why `date-helpers.js` and `format-helpers.js` exist
  separately — client components were formatting inline and drifting.
- **`_components/ui/` must not know what the business is.** If a component
  mentions litres, customers or rupees, it belongs in `admin/`.
- **Migrations are append-only.** Correct a mistake with a new numbered file,
  never by editing one that has run.

## Leaving the work better than you found it

**Explain the why in the commit.** These projects are picked up months later by
someone with no memory of the session. Say what was wrong, what you changed,
what you traded away, and how you verified it. If something broke on the way
and you fixed it, say that too — it stops the next person reintroducing it.

**Keep a changelog that records reversals.** The most valuable entries are
"this was tried the obvious way and reverted, here is why". Without them, the
obvious way gets tried again.

**Say what you did not do.** If you verified three screens and inferred the
other six, say which. If part of the task is blocked, finish everything else
and name what is left. Overstated confidence in a money app is worse than a
gap, because the owner stops checking.

**Audit the docs periodically.** Migration tables stop at the last release
someone remembered; a `README` still describes a navbar that became a sidebar.
Grep for the names of things you removed.
