# kodexa-builder learnings

This file is how this repo teaches the kodexa-builder skill. Every session
that loads the skill reads it first and appends to it as the user corrects,
reverses or chooses things. Entries promoted into the skill are marked with
the version they landed in. See the skill's `references/self-improvement.md`
for the rules.

- **Project:** Mubeen Petroleum Service, the petrol pump's daily books
- **Type:** dashboard
- **Who reads it daily:** the owner, on a cheap tablet in poor light and on a
  1600x900 laptop, and the staff he creates logins for
- **Palette exceptions:** purple, pink, cyan, glass
  (purple is the credit tone and the credit series in the charts; pink and
  purple are among the customer-avatar tints and the company-asset category
  hues, the one page a decorative hue is allowed; cyan covers petrol's sky
  blue and the teal "held" tone; glass is the backdrop blur behind a dialog
  and the sidebar. All deliberate, and each is in `docs/UI_CONVENTIONS.md`.)
- **Skill version when started:** 1.3.0 (first loaded here on 27 Sep 2026,
  after the app was built; the entries below come from the sessions that
  moved every page to the new look)
- **Built here:** v1.4.0 on 27 Sep 2026, packaged as
  `.claude/kodexa-skill-update/kodexa-builder-v1.4.0.skill` for the user to
  upload in Claude Code settings in place of v1.3.0

## Summary

| ID | Date | Kind | Lesson (short) | Scope | Status |
|---|---|---|---|---|---|
| L-001 | 2026-09-27 | reversal | Cards side by side are one height; the spare height goes where it explains itself | type: dashboard | promoted v1.4.0 |
| L-002 | 2026-09-26 | correction | A caption over part of a list names the list; it does not compare | type: dashboard | logged |
| L-003 | 2026-09-27 | gotcha | `min-h` on a padded element does nothing under `border-box` | all | logged |
| L-004 | 2026-09-26 | rule | A live database: find it by ref or by its data, read only, hash before and after, never change a row | all | promoted v1.4.0 |
| L-005 | 2026-09-26 | rule | Dashes in text you cannot edit (applied migrations, outside services) are cleaned on the way to the screen | all | promoted v1.4.0 |
| L-006 | 2026-09-27 | repeat | "Merge to main, then X": fast-forward what is done, check its migrations are live, carry on on the same branch | all | promoted v1.4.0 |
| L-007 | 2026-09-26 | gotcha | `pkill -f` matched the shell running it | all | covered |
| L-008 | 2026-09-27 | gap | Dashes in docs written before the rule: the skill bans them, project-docs forbids rewriting history | all | logged |
| L-009 | 2026-09-28 | gotcha | A value copied onto a row at save time goes stale when its source is set later, and the screen must show the copy | type: dashboard | logged |
| L-010 | 2026-09-28 | gotcha | A client's voice note (Urdu, WhatsApp .ogg) is transcribable in the container with faster-whisper | all | logged |

## Entries

### L-001 · 2026-09-27 · strong · reversal
- **Said / saw:** "some cards are inconsistent in terms of height and that look weird, can you fix them?" (screenshots of Banking's accounts, the Dashboard's lubricants and Treasury's two breakdowns, the space under the shorter card circled in red), then "yes merge into main" (0fe49a0).
- **Context:** petrol pump, after every page moved to the new look. The repo's own rule had been `items-start` on summary rows ("a short card stays short"), reasoned from one card holding a single line.
- **Lesson:** Peer cards in a row are one height: let the grid stretch (its default), then choose where each card's spare height goes so it never reads as a figure that has not loaded. Pin the line compared across the row (a total, a status, the card's one button) to the foot with `mt-auto`; or give the space to the part that is empty for a reason written on it; or let a tinted tile grow to fill it. Give the cards the same shape where they are compared: a status badge sits in the slot where the other cards have its action, not under one card's title. A panel beside something that grows without limit (a table) keeps `items-start`.
- **Scope:** type: dashboard
- **Target in skill:** references/types/dashboard.md, section 10, "Lists, charts and pickers"
- **Status:** promoted v1.4.0

### L-002 · 2026-09-26 · medium · correction
- **Said / saw:** "this text is wrong i think as spent is more than recovered" (Expenses: the repayments listed under "More came back than was spent this month")
- **Context:** petrol pump, the Expenses breakdown. Each repayment had been typed under a category name of its own, so every one landed in that list, and the month had spent more than ten times what came back.
- **Lesson:** A caption over part of a list is read as a claim about the whole page. Name the list with the word already on the button and the card ("Recovered this month"); a sentence true of each row and false of the page is false where it will be read.
- **Scope:** type: dashboard
- **Target in skill:** references/types/dashboard.md, section 10, "Language"
- **Status:** logged (once)

### L-003 · 2026-09-27 · medium · gotcha
- **Said / saw:** Banking card footers measured 45px and 54px, `min-h-10` sitting on the element that carried `border-t pt-4`; the rules above them were 9px apart on cards of equal height.
- **Context:** petrol pump, the card-height fix (L-001).
- **Lesson:** Under Tailwind's `border-box`, a `min-h` counts the element's own padding and border. A min-height meant to hold a row at a control's height goes on an inner element with no padding.
- **Scope:** all
- **Target in skill:** references/types/dashboard.md, section 11 (verification)
- **Status:** logged (once, caught before it shipped)

### L-004 · 2026-09-26 · strong · rule
- **Said / saw:** "i have connected the supabase connector, you can can apply migrations, but he aware that this is real client data, donot do anything destructive to data". The account held three projects and the checkout had no `.env.local`; this repo's changelog records a migration applied to the wrong project in August.
- **Context:** petrol pump, applying migration 065 to the live books.
- **Lesson:** Before touching a live database through a connector, identify the project by its ref against `.env.local` or the deploy's env; with neither, by a figure only the live data can produce (a month's total off the client's own screenshot), never by name or by being the only one listed. Read with `select` only, hash the rows a migration can reach before and after and report both, test a refusal inside a block that rolls itself back, and never change a row: data corrections go back to the client as steps.
- **Scope:** all
- **Target in skill:** SKILL.md section 5, beside "Tests never write to a live database"
- **Status:** promoted v1.4.0

### L-005 · 2026-09-26 · strong · rule
- **Said / saw:** "and make sure em dashes are not present," (about every page). The activity log and Postgres's own refusals, written by migrations that had already run, still put dashes on screen (c0604de: `withoutDashes()` in `format-helpers.js`, applied in the `{ ok, message }` wrapper).
- **Context:** petrol pump, the em dash sweep.
- **Lesson:** The dash rule reaches text you cannot edit: sentences a trigger or function writes at runtime from migrations that have already run (a migration is never edited once applied), and messages from outside services. Clean it in one helper on the way to the screen, applied where server messages are rendered, and write new migrations without dashes. A file scan cannot see runtime text.
- **Scope:** all
- **Target in skill:** references/anti-slop.md, "Always rejected" (the em dash)
- **Status:** promoted v1.4.0

### L-006 · 2026-09-27 · medium · repeat
- **Said / saw:** "merge to main and come back to this branch claude/friendly-carson-3miamw and  then stock page redesign" (earlier on this branch), then "first push to main" / "merge with main and then fix", then "yes merge into main".
- **Context:** petrol pump, one long redesign branch merged in stages.
- **Lesson:** Merging to main is the user's call, and usually comes before the next change starts. When asked to "merge to main, then X": check that every migration the branch's code needs is already live (main deploys against the live database), fast-forward main to the branch as it stands, push, return to the same branch and do X there, then offer to merge X when it is done.
- **Scope:** all
- **Target in skill:** SKILL.md section 3, "Working style the user has shown repeatedly"
- **Status:** promoted v1.4.0

### L-007 · 2026-09-26 · medium · gotcha
- **Said / saw:** `pkill -f "next dev -p 3100"` ended the shell running it (exit 144) before the cleanup after it ran.
- **Context:** a session that had not loaded the skill.
- **Lesson:** Already in SKILL.md section 3. A bracket in the pattern (`pkill -f "next dev -p 310[0]"`) also works, because the pattern no longer matches its own command line.
- **Scope:** all
- **Status:** covered

### L-008 · 2026-09-27 · low · gap
- **Said / saw:** `slop_scan.py` fails this repo on dashes, about 1,600 by character: 0 in the app's code, 70 in applied migrations, 6 in `scripts/`, and about 1,520 in the markdown (`docs/`, the root files and the project skill), written before the rule reached them.
- **Context:** the docs refresh after the redesign.
- **Lesson:** The skill bans dashes in docs too; `project-docs` forbids rewriting past changelog entries; this repo's `CLAUDE.md` scopes the rule to what a person reads in the app. Asked the user whether to sweep the docs (punctuation only, no wording) or leave history as written and keep new text clean.
- **Scope:** all
- **Target in skill:** references/anti-slop.md, a line on docs that predate the rule
- **Status:** logged (awaiting the user's answer)

### L-009 · 2026-09-28 · medium · gotcha
- **Said / saw:** "the fuel rate for 27-09-2026 for diesel is 412.25 and when muliplied by total sale for nozzle A ... it comes to be 97,373.45 but on the nozzle it is shown 98221", then "fix the two days entries too with these rates, so that owner does not make the entry mistake"
- **Context:** petrol pump. Each reading copies its rate at save time; the owner often sets the morning's price after entering the day. Four days had crossed (migration 066).
- **Lesson:** When a row keeps a copy of a value that can be set or corrected LATER for the same date (a price, a rate, a tax), decide up front what a backdated change does to rows already saved, and make it explicit: re-derive them in the same transaction and say what moved, or refuse. Show the copied value wherever the derived figure is shown, or a mismatch cannot be explained from the screen. And warn at entry time when the value is carried over from an earlier date.
- **Scope:** type: dashboard (ledger apps)
- **Target in skill:** references/types/dashboard.md, section 10 "Money and figures" (and the ledger skill's database-rules)
- **Status:** logged

### L-010 · 2026-09-28 · medium · gotcha
- **Said / saw:** "can you understand what the client wants to add by listening to this audio" (a 65-second WhatsApp voice note in Urdu)
- **Context:** petrol pump, the supplier ledger request.
- **Lesson:** Client requests arrive as WhatsApp voice notes, often in Urdu. In a cloud container, `pip install faster-whisper` in a venv and the `medium` model transcribes Urdu well (p=0.92) in a couple of minutes on CPU; run it twice, `transcribe` and `translate`, and read the Urdu yourself, because the machine translation garbles key nouns ("the invoice" came out as "the conditions"). Keep the audio local; say which words are uncertain.
- **Scope:** all
- **Target in skill:** SKILL.md section 3, "Working style the user has shown repeatedly"
- **Status:** logged


### L-011 · 2026-10-06 · high · preference
- **Said / saw:** "we will copy these features to other repos too, i think this al hakeem client is giving me good suggestions, so remember that in future these suggestions will also be implemented on other pumps repo too"
- **Context:** petrol pump client copies. Al Hakeem asked for self-setup of the forecourt (800), an evening dip default, and fleet customers (801).
- **Lesson:** When one client of a multi-client product asks for something, build it in that client's repo first but build it to travel: no client-specific names in the code, migrations that are safe on a live pump with data, and a written list of what is waiting to be carried (`docs/PORT_TO_OTHER_PUMPS.md`). A behaviour that is how one pump works (the dip time) goes across as a setting, not as a new default for everyone.
- **Scope:** all (multi-client products)
- **Target in skill:** SKILL.md section 3, "Working style the user has shown repeatedly"
- **Status:** logged
