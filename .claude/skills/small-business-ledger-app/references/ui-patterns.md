# The design language

Patterns settled over many rounds of work on a live app, most of them arrived
at by getting the obvious thing wrong first. Follow these rather than
reinventing them; a new pattern should be a deliberate choice, not an accident
of not knowing the existing one.

Read `references/readability.md` for type, colour and number formatting, and
answer the audience question in `SKILL.md` §0 before applying any of this — the
sizes below assume the older reader.

---

## Anything destructive confirms in a dialog, never inline

**The rule: a confirmation must not change the size of anything on the page.**

The tempting version is to swap the delete icon for a question and two buttons
in place. It is wrong for a reason that only shows up in use: inside a table
cell, a 44px icon becomes a three-line block, so the row grows, its column
widens, and every row beneath it jumps down the page. **The row someone is
aiming at moves while they are reading the question** — the worst possible
instant for a page to shift.

One shared `<ConfirmAction>`: an icon trigger, a dialog with the question, the
consequence, and a red confirm.

- **The caller keeps its own form state.** The shared component owns only
  open/closed and the chrome; the action, its pending state and its error
  message stay with the caller.
- **A refusal keeps the dialog open.** When the database turns something down —
  a customer who still owes money, a delivery a later entry depends on — that
  message *is* the interaction. Closing on failure throws away the only useful
  part.
- **There is now room for the sentence that matters.** "Readings already
  entered keep the rate they were sold at" fits in a dialog and does not fit in
  a table cell. If a delete has a consequence people assume wrongly, this is
  where it goes.
- **Write the dialog out by hand when a confirmation needs more than a yes** —
  a typed-name field for something irreversible, for instance.

Use a **native `<dialog>` with `showModal()`**, not a div. Focus trapping,
Escape, an inert background and the backdrop all come from the browser already
correct. Full-screen sheet on a phone, centred panel above `sm`.

**No click-outside-to-close on anything holding a form.** A `click` event fires
on the nearest common ancestor of mousedown and mouseup, so selecting text in a
field and releasing a few pixels past the panel edge targets the dialog itself
and is indistinguishable from a backdrop click. That silently threw away a
half-typed entry. Escape, a header ✕ and Cancel are enough. A nav drawer holds
no input and may close on its backdrop.

### A modal inherits typography from whatever opened it

`<dialog>` + `showModal()` paints in the browser's **top layer**, so nothing
about where the element sits in the DOM constrains its position or its size.
That is easy to over-read as "where it sits does not matter at all". Inherited
properties still come down the DOM ancestry as normal — and a confirm dialog is
usually rendered inside the table cell its trash icon lives in.

A right-aligned, `whitespace-nowrap` money cell passed both down to the
confirmation inside it. The sentence explaining what deleting would do came up
right-aligned, could not wrap, ran off the panel and put a **horizontal
scrollbar inside the dialog**. Neither the DOM clipping check nor a glance at
the row showed anything.

Put `white-space: normal; text-align: left` on the dialog panel as a **reset**,
in the shared component, not at the call site — the panel is what is wrong. Any
other inherited property a cell might carry (`font-size`, `text-transform`,
`font-variant-numeric`, `line-height`) is a candidate the moment it appears.

**Treat the top layer as isolated for layout and inherited for typography.**

## Dialogs for what is set up once, forms for what is done daily

A form standing open on a page is a claim that it will be used every time the
page is opened. Recording the evening's takings, yes. Adding a bank account,
changing nozzle wiring, adding a product to the list — no. Those go behind a
button, and the page keeps its space for the work.

## Pagination wherever data grows

**A table that grows without bound does not belong sitting open on a page read
for something else.**

- The page it lives on keeps a **bounded, recent slice** and links to the full
  history. The history is **its own route with a pager**.
- **The page number is a query string**, so Back walks through it and any page
  can be linked or reloaded.
- **The table is a shared component** used by both, so the columns cannot drift
  apart between the summary and the history.
- **Page by whatever the data is really counted in.** Rows, usually. But a
  daily series that fills in empty days pages by *date window*, or the page
  count comes out wrong.

### When the page size should be a unit rather than a count

Ask whether the data has a unit **the reader already counts in**. A cash safe
written up three to six lines a day has one: the day. Paged by rows, a page
held four and a bit days cut mid-day at both ends, was tall enough to grow its
own scrollbar, and could not show a day's opening or closing figure at all —
the rows started and stopped mid-day, so no such figure existed to print.

If the unit is real, page by it:

- **Address the page by the unit, not by an index.** `?date=2026-08-21`, not
  `?page=3`. An index is not stable: back-fill one older row and every index
  after it means a different day, so a bookmarked page quietly becomes the next
  one's contents.
- **Skip empty units, and let the database say which are empty.** "Previous"
  and "next" go to the neighbouring units that *have* rows, so an arrow never
  lands on a dead page. This is the opposite of what a chart does with a gap —
  a chart draws a continuous quantity and a quiet day in it is real, while a
  page is a thing to read and an empty one is a dead end.
- **Resolve any requested unit to one that exists, and say when you did.** A
  page that quietly shows a different day than the one asked for is read as the
  day asked for.
- **Whatever every row on the page now has in common stops being a column and
  becomes the heading**, and the width it frees is usually what the remaining
  columns were short of.

The unit also gives you figures a row-paged view cannot have — the day's
opening and closing — and those are often the ones actually checked against
cash in a drawer.
- **A dead pager button is a `<span>`, not a link styled to look disabled.** A
  disabled-looking link still takes focus and still navigates.

### Two traps, both hit for real

**A cap on a list you are going to total is a cap on the total.** A query
limited to 100 rows, on a page that sums supplier debt across all of them,
under-reports the debt from the 101st delivery onward — silently, forever.
Remove the cap and page the *display*; if the set ever gets genuinely large,
give the total its own aggregate query.

**Size the page to the viewport, not to a round number.** 25 rows overran a
table's max-height, so the card grew its own scrollbar inside a page that
already scrolls, and the wheel did one of two different things depending on
where the pointer sat. Count what fits and use that. Keep the page size **even**
where rows come in pairs, so a pair never straddles the fold.

### Sizing a preview slice

A preview is a glance, so it must fit without scrolling. But respect what the
rows mean: if two rows are read as a pair, cut on the pair boundary, not at an
exact count. Cap at *n* rows, then extend to the end of whatever group the last
row belongs to — five or six rows, never half a pair.

## Filters are query strings, and the current one is not a link

Chip rows — `All / Packed / Loose`, `7 / 14 / 30 / 90 days`, `Everyone / each
person`.

- **The selected chip is a `<span>` with `aria-current`**, not a link back to
  the page you are on.
- **`scroll={false}` on the others.** A router link resets the scroll to the
  top, which is right when the whole page changes and wrong for a filter. If a
  control changes only what sits beside it, it must not move the page.
- **Two controls on one page each carry the other's value.** A date stepper and
  a filter must both preserve the other in the URL, including any no-JavaScript
  form's hidden fields — miss one and stepping the date silently resets the
  filter, which reads as the *arrow* being broken.
- **Drop the page number when the filter changes.** Staying on page 4 of a list
  that just became six rows long shows an empty table and looks broken.
- **Validate against the allowed set**, never `Number(param) || default`, or a
  hand-edited URL asks the database for three years of daily rows.

## Filter a list; do not split it across routes

Splitting by route makes the reader decide *where a thing lives* before they can
look for it, and it means a figure that is one number in the owner's head —
"what did we take today" — is never on one screen.

Two kinds of the same record belong in one list with a marker on the rows that
differ and a filter above it. The busy-day view is then one tap away and the
ordinary case is right by default.

Separate routes are for genuinely different *work*, not different containers of
the same thing.

## When a list should stop being a table

Every list can be a table that scrolls sideways inside its card — right for
short numbers, where the reader knows what is off to the right.

**The test is whether the widest column is a sentence.** An audit log measured
perfectly at phone width — nothing clipped, no page scroll — and looked broken:
two narrow columns of timestamps beside acres of white, because the row heights
were set by a 700px description sitting off-screen. Scrolling right to find out
*what happened* defeats the page.

The replacement is one piece of markup that is a grid of columns above a
threshold and a stack below it:

- **`@container` on the wrapper**, container-query variants throughout.
- **`display: contents` at the breakpoint** is what avoids writing the markup
  twice: wrap the secondary fields in one element that is a flex row when
  stacked and dissolves into grid cells when wide.
- **DOM order is the phone order**; `order-*` and `col-start-*` rearrange it for
  the columns. What happened comes first in the markup, because that is what
  the reader came for.
- **Measure the columns, then set the threshold above their total.** Guessing
  produced a layout where a seven-figure sum wrapped onto two lines at a common
  laptop width — with the DOM reporting no clipping.

**The smaller case: a table of figures with an occasional note.** It stays a
table, but the note does not get a column. A free-text column beside figures
that never wrap is given whatever they leave, which on a tablet was 112px: a
60-character note one word to a line, a row four times the height of the rest,
and a table too wide to fit without scrolling sideways. Put the note on a line
under the row's description instead, capped at a readable measure (about 48ch)
so a long one wraps rather than widening the column, and able to break a long
unbroken string. Test it with a real long note, not a short one or none.

**The widest case: a table whose point is at the far end.** A reconciliation
sheet reads across to its running totals, so scrolled to its natural start it
shows the least important columns. Pin the ends (which row, and what it adds
up to) and let the working in between slide. Pinned columns need fixed widths
because a sticky offset is a number, and **pin the far block only where it fits
beside the near one**: four pinned columns wanted 28rem, a phone's panel had
20, and pinned regardless the totals slid over the date and printed a
truncated year. Below the width that fits, pin the row's label alone and let
the totals scroll; put the bottom line somewhere above the table as well.

## Responsive: measure the container, not the window

Once there is a sidebar, viewport width and content width are different
numbers — a 1024px window may give a page 768px. `sm:` and `lg:` ask the wrong
question about anything inside the content area. Use `@container` and `@[..]`
variants so a component's layout follows *its own* width.

## Cards side by side are one height

A row of cards with ragged bottoms reads as broken, however honest each card's
own height is. Let the grid stretch them (its default), then decide where each
card's spare height goes, so it never reads as a figure that has not loaded:

- pin the line a reader compares across the row (a total, a status, the
  card's one button) to the card's foot, so those lines sit level;
- or give it to the part that is empty for a reason written on it ("No
  readings entered for this day");
- or let a tinted tile grow to fill it.

Give the cards in a row the same shape where they are compared: a badge that
makes one card's header a line taller puts its figure out of step with the
next card's. What does not stretch is a panel beside something that grows
without limit, a table or a list; stretched, it would be as tall as the table.

(The app this was learned on followed the opposite rule for a while, "a short
card stays short", reasoned from one card with a single line in it. A whole app
of white cards on a grey page read the ragged rows as the fault.)

## Every control that waits says so

A button that runs a server action and does not change is indistinguishable
from a button that did not register the tap — and the natural response is to
press again. Wrap every submit so it disables itself and shows a pending label.

**This is not optional on destructive buttons.** Thirteen of them were missed in
one project and the owner reported it as the UI freezing, which is exactly what
it looks like.

Links that navigate to a server-rendered page need the same treatment: a
spinner in the link, and never close a drawer on the click — close it when the
navigation lands, or the only feedback disappears while the next page loads.

## Buttons

- One primary per view, and only break that when two actions are true peers.
- **A filled button and an outlined one must be the same height.** If the
  outlined one carries a 1px border, give the filled one an invisible border in
  its own fill colour. Two pixels is small enough never to look like a bug and
  large enough to make a row look wrong.
- Size overrides are utility classes after the component class, not new
  variants.

## Icons

- Draw them inline on one grid at one stroke weight rather than adding a
  package. Twenty icons is not a dependency.
- **An icon never carries meaning alone.** Every icon sits beside its own word
  and is `aria-hidden`. The icon is the redundant second cue: shape, on top of
  the word and the colour.
- **One deliberate exception**: an icon-only button for a row action, where the
  word was being repeated down every row. It needs a mandatory label that
  becomes both `aria-label` and the hover title, and the action behind it must
  confirm in words.
- **Do not icon everything.** Where two things already differ in word and
  colour, a third cue adds shape without adding distinction.

## Colour is never the only cue

The most common quiet failure. A stock column signalling "out of stock" by
printing the number red and nothing else is unreadable in a dim room and
identical to a healthy figure for a red-green colourblind reader. Add the word:
a small `out of stock` / `low` badge beside it.

Same rule for created/changed/deleted, paid/pending, entered/not entered.

### It is a floor, not a ceiling

The rule says what colour may not be the *only* carrier of. Applied backwards —
as "strip any hue that isn't doing a job" — it produces screens that are
correct and unpleasant, and the owner will tell you so in one word. A register
someone reconciles against a drawer earns its colour; a list someone browses
may simply have some. What makes a decorative hue safe is not that you found it
a meaning, but that **the thing it sits on is already fully identified without
it** — an icon and a written label, not one or the other.

Two hues it may never spend, in any app of this shape:

- **A colour the data owns.** If blue means petrol, nothing in the chrome is
  blue. A colour spent twice has stopped meaning anything, and the one that
  loses is the one doing the safety job.
- **A status colour, on a card carrying a figure.** Amber beside `132,000`
  reads as a warning about the number, whatever you intended it to say about
  the category. Same for red. This is what usually rules out the "obvious"
  palette and leaves a genuine ceiling of three or four usable hues — when you
  run out, let the next category fall to neutral rather than reaching for a
  reserved one.

Pale ground, dark glyph. A saturated fill puts the decoration above the figure,
which is the one thing on the card that has to lead.

## Decoration yields; the figure never does

A sparkline, a chart, an icon — anything decorative on a tile shares its width
with a number that cannot shrink. Money is `nowrap` (a figure breaking after
the currency reads for a moment as two figures), so when they do not both fit
it is the decoration that hides. **Never let decoration be the reason a figure
cannot be read.**

Two measurement traps behind that, both hit for real:

- **Test containment against the card's PADDING box, not `scrollWidth`.**
  `scrollWidth > clientWidth` asks whether an element overflows *itself*,
  which is not the question — a figure can sit entirely inside its own box
  while hanging out of the card. Walk every width in steps and compare each
  child's rect against its card's padding box.
- **An SVG with a `width` attribute does not shrink.** Size charts with a
  class and let the viewBox scale, or the thing pushes out through the card's
  edge on a narrow tile.

Better still, give decoration a place it never has to share: a sparkline as a
full-width band along the card's bottom edge competes with nothing at any width.

**The line under a figure plots that figure.** A card showing fuel-plus-oil
takings over a fuel-only trend line reads fine until someone hovers today and
the readout disagrees with the card by the day's oil. Build the series the way
the figure is built, and check that its last point equals the figure.

## A change against nothing is not a percentage

A zero baseline and an absent one usually arrive identically from a summary
query, and "rose from nothing" and "there is no earlier period" are different
sentences. Given the choice between a label that is sometimes wrong and no
label, **show no comparison** — the figure it sits under is unaffected and
still true. "+100%" is an invention, not a measurement.

**The mirror case: a day that has not been entered yet.** Every evening until
the day's figures are typed, today is zero against a full yesterday, and a badge
announces "down 100%" in red over a card that also says "nothing entered". That
is a missing day, not a collapse, and the badge is the loudest thing on the page
asserting the wrong one. If the day has no entries, show no comparison.

And keep two axes apart on any delta: **the arrow is direction, the colour is
whether it is good news.** Expenses up is an up arrow and a red pill. Colouring
by direction alone paints "expenses rose 40%" the same green as "sales rose
40%", which is the one mistake a money app cannot make.

## Texture: nothing smaller than the thing it sits on

High-frequency detail — noise, 1px hairlines — shimmers as a panel scrolls on
a cheap screen, can moiré against the pixel grid, and gives an older eye
something to keep trying to focus on that is not there. If a surface wants
depth, use washes measured in hundreds of pixels, and keep the only fine
detail on the *edge*, where it is read once instead of scanned.

**Depth is stacked shadows, not one big one**: a tight contact shadow, a mid
one for the body of the lift, a wide ambient one, and a light hairline inset
along the top edge. The eye reads the combination as height and any single one
as a blur. Lift one thing on a page, not everything.

## Derive from user data? Test on the user's data

A helper that turns a name into initials, or a label into a code, will pass
every fixture you invent and still be wrong, because real records carry things
fixtures do not — ledger numbers, trailing codes, punctuation. One real list
found in a moment what careful reasoning about the algorithm did not.

## The day on screen is stated once, and loudly

On any page scoped to a date: one tinted banner carrying the weekday, the
written date, and what that day is relative to today — larger than anything
else in the block, tinted whenever it is *not* today.

Three quiet restatements of the same fact — a small grey line, a date box the
browser draws in its own locale, and the date repeated in the page description
— is how a day's work ends up filed against the wrong date.

**Two different dates deserve two columns.** When something was *entered* and
the day it was *filed against* are not the same, show both. An entry made on
the 9th against the 3rd is the shape of an honest correction and of a dishonest
one alike, and a screen showing only one of the dates cannot tell you it
happened.

## Say which span a number covers

A running total and a daily total on the same screen, both unlabelled, produce
a page that appears to contradict itself: "nothing sold today" above a row
reading "sold 1 L". Neither is wrong; they count different spans and nothing
says so. Put the span in the heading — "Everything bought and sold up to 09
Aug, not just today" — not in small print at the bottom.

## A caption over part of a list names it; it does not compare

A heading over a sub-list is read as a claim about the whole page. "More came
back than was spent this month" was written about each row under it (in each of
those categories, more came back than went out) and read as a statement about
the month, which had spent more than ten times what it recovered. A sentence
that is true of every row and false of the page is false where it will be read.
Name the list instead, with the word already on the button and the headline
figure ("Recovered this month"), and let the figures do the comparing.

## Let spacing do the grouping, and drop what it makes redundant

Where items belong to physical groups, the gap carries the grouping: a large
gap between groups against a small one inside. The heading then only names what
the spacing already showed, and the repeated prefix on each item can go.

## Use the words the business already uses

Not the words a bookkeeper would use, and not a literal translation. Where a
trade has its own vocabulary — a register's own terms for debit and credit, for
instance — **that word is the label** and the English is the gloss beside it,
not the other way round. The owner has been writing it by hand for years and no
phrasing invented in an interface will compete with it.

Rendering another script inside an English sentence: wrap it in `<bdi>` with
`lang` and `dir`, or the bidi algorithm drags the surrounding brackets around
it. Give it a size step up — most non-Latin scripts carry more detail per
character and do not survive 14px.

## A long instruction page is read by scanning

For any help or guide screen — opened for one answer, then closed:

- **A location chip instead of a sentence about where to go**, carrying the
  same icon as the nav tab so it points at something already on screen.
- **A rule leads with its claim in bold**, then explains. Ten short bold lines
  can be taken in; ten paragraphs behind ten identical warning icons cannot.
- **Fold away what is done once.** A native `<details>` — no JavaScript, no
  state, still found by the browser's own search.
- **Split cards by how often they are used**, not by subject.

A marker costs vertical space and buys scanning speed; expect the page to get
*longer* before the folding pays for it.

## Navigation

A column down the side beats a row of tabs past about eight sections — laid out
sideways they either scroll, hiding the last two on every laptop, or wrap onto
a second row that eats the top of every screen.

**Count the height when you add the ninth item.** A nav that overflows by eight
pixels gets a permanent scrollbar slab down its side on Windows. Trim the item
height and the identity block before reaching for `overflow: hidden` — and do
not reach for it at all if Sign out is the last item, because a list that
silently ends above it leaves the owner unable to sign out with nothing on
screen to say why. Keep the scroll, style it to a hairline, and make sure it
only fires on genuinely short windows.


## A destructive control explains itself where it stands

A button whose consequences are not obvious from its label — "Back up", "Clear
old entries", "Empty everything" — gets a panel with sentences, not a place in a
row of header buttons. Say what it does, what it does not touch, and what
undoing it would involve. Documentation nobody has open is not a substitute.

Put it where its KIND of work lives, not where it superficially rhymes. A backup
is maintenance, so it belongs with the settings that are configured once and
left alone — not next to a report download just because both produce a file. The
question the reader is answering when they arrive on a page decides what belongs
on it.

## A failure that arrives in the URL must be able to leave

A download is a link, not a form: on success the browser saves a file and the
page never re-renders, so a failure reported by redirecting back with a reason
in the query string stays on screen after the problem is fixed. Show it, then
strip the parameter from the URL (a history replace, not a router navigation
that re-fetches the page), give it a dismiss control, and clear it when a fresh
attempt starts. Successes get a toast because a message that outlives what it
describes starts describing something else; errors persist — but not past the
point where they are still true.

## The table behind a chart: above it, and in a modal

When a page offers both a chart and the same figures as a table, the table is
what someone reaches for when the chart is not answering their question. So the
way into it goes **above** the chart, not below — otherwise the reader scrolls
past the thing that just failed them to find the alternative. Open it as a modal
rather than expanding it inline: nothing moves on the way past, and the table
gets the whole screen when it is wanted. A `<details>` strip with no button and
no border reads as furniture rather than a control.

## A running total in a paged table belongs to the series, not the page

A Balance, Closing or Cumulative column says what the figure was after that row,
which is a fact about every row before it. The moment the table is paged, a total
accumulated in the component is accumulated over whatever the page happens to
hold, and the column is out by the net of everything older.

This is a silent failure. Nothing throws, the arithmetic inside the page is
self-consistent, and the number is plausible. It surfaces when a reader compares
the newest row against the headline total and finds two different numbers, which
he will do at the worst possible time.

- Compute it in SQL over the whole series and take the page afterwards:
  `sum(...) over (order by ...)`. It is also money, so it wants `numeric` rather
  than a double for the same reason every other total does.
- Order the window and the list by the same **total** order. Rows written in one
  transaction share a timestamp to the microsecond, so a date plus a time is often
  not one; add the primary key as a final tiebreak in both.
- The check that catches it: the newest row's running figure must equal the
  headline balance. If it does not, the column is relative to something.

## A figure the reader cannot find twice will not be believed

A statement of account, an invoice, a payslip: the reader checks it by looking for
its numbers somewhere else. A figure that exists only on that page because the
page derived it — an allocation, an apportionment, a weighted share — cannot be
checked, only explained, and a document that has to explain its own arithmetic
before it means anything is a document people argue with.

An open-item statement shows this clearly. Payments are applied to the oldest
invoice first, because nothing records which payment settled which invoice; the
convention is universal and the totals are exact. It still prints lines like "Rs
4,980 paid off, Rs 20 still due" against a Rs 5,000 fill, and Rs 4,980 is nowhere
in the ledger. Balance-forward is longer and every line is a row the customer can
point at.

- Prefer the shape whose every line exists in the underlying record.
- Write it for the person being asked to pay: short lines, ordinary words, no
  explanation of the document to itself.
- Something undone still has to appear, or the running balance steps with nothing
  to account for it — but it must not read as money. Mark it, and keep it out of
  the "received" and "charged" subtotals. Listing a reversal as a payment is
  writing a receipt for money nobody handed over.
- Keep the on-screen version and the printed one to the same columns. Then the
  two can be read against each other, which is the only reason either is worth
  checking.

## Filter the period with dates, and re-label what the dates change

A rolling window ("last 30 days") and a date range are not two spellings of the
same control. The window answers *how are we doing lately*, where the end is
always now; the range answers *these particular days, which I chose*. Reviewing
trends wants the first. Settling an account, reconciling a month, arguing about a
week somebody is suspicious about — all want the second, and a window cannot
express any of them.

The trap in switching is that a window always ends today, so a headline total is
always current and its label can be a constant. A range can end in the past, and
then the same total means something else entirely:

- **When a filter can change what a headline figure MEANS, change the label with
  it.** "Balance as at 31 Aug" and "Total now due" are different claims, and the
  second one printed over the first is a demand for the wrong money. Carry one
  flag out of the arithmetic and let every renderer switch on it, so the screen
  and the document cannot disagree about which they are showing.
- **Anything derived alongside it has to respect the same end date.** A statement
  for August that mentions a payment received in September contradicts its own
  closing figure.
- **Blank should mean "no limit at this end"**, which makes "everything" the same
  control rather than a mode beside it. Presets fill the boxes; they do not
  replace them, so a preset is a starting point you can nudge.
- **Either end pushes the other rather than being refused**, and the server
  re-checks regardless — a URL is not a control.
- **Native date inputs clip rather than shrink.** Two side by side on a phone will
  quietly drop the year. Give them a min-width and let whatever shares the row
  wrap below them.
