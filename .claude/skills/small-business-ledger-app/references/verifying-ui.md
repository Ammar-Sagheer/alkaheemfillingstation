# Verifying a screen by looking at it

## Why a measurement is not enough

`hasScroll: false` can be numerically true while the screen is wrong. It is
compatible with a figure wrapping onto two lines, a name truncating to "Mubeen
Petr...", a column pushed off the edge of a card, or six cards packed so
tightly they read as one block.

It also cuts the other way: an element reporting as "overflowing" is often
fine — a `truncate` class doing its job, a table wrapper that scrolls
deliberately, an `sr-only` heading. Numbers alone cannot tell you which. So run
the check *and* open the screenshots.

## The disposable route

Logging in through the browser to see one component is usually more friction
than the check is worth. Instead, add a temporary route that imports the real
components with fixture data — in Next.js, `app/devcheck/page.js`.

Two things make this useful rather than misleading:

**Import the real components.** Copying their markup into the fixture means you
are verifying a copy, and the copy will drift. If a component needs a server
action it will still render; the button just does not submit.

**Use realistic content, and the awkward cases.** The longest product name a
real shelf carries. A seven-figure sum. A day with nothing entered. A row where
the optional field is absent. Lorem ipsum and `123` hide exactly the bugs you
are looking for — short placeholder text never truncates.

**Delete it before every commit.** `rm -rf app/devcheck` and confirm with `git
status --short`. It imports server-only modules and would break the production
build. Put this in the project's own conventions file so the next session
inherits the habit.

## Running the check

```bash
node scripts/render-check.mjs http://localhost:3000/devcheck ./shots
```

Defaults to 1440 / 1152 / 1024 / 400. Add the narrow phones when money is on
screen:

```bash
node scripts/render-check.mjs http://localhost:3000/devcheck ./shots --widths 400,360,320
```

Seven-digit sums fit at 400 and overflow below it. 320 is an older phone and
still in use.

## Which widths matter and why

| Width | What it catches |
|---|---|
| 1440 | The ordinary case. Also whether a max-width leaves the page looking empty. |
| 1152 | Where a fixed sidebar starts squeezing content. |
| 1024 | Tablet landscape. Wide tables begin to scroll here. |
| 400 | Phone. Multi-column grids must have collapsed by now. |
| 360 / 320 | Where large numbers stop fitting two-up. |

## Reading the clipping report

The script lists elements whose content is wider than their own box, with their
classes so you can judge intent. Triage:

- **A number in the list is never acceptable.** Fix the cause, not the symptom
  — move a unit into the caption, drop a column, let the grid go one-up — do
  not shrink the digits to fit.
- **Deliberate truncation** (a business name with `truncate`) is fine, but ask
  whether the truncated thing matters. A pump's own name cut to "Mubeen
  Petr..." on its own screen is a bug even though the class is intentional.
- **A `table-scroll`-style wrapper** reporting wider than its parent is usually
  the negative-margin trick that lets a table reach the screen edges on a
  phone. Confirm the *page* does not scroll sideways; that is the real test.

## The other clipping question: does it escape its CARD?

`scrollWidth > clientWidth` asks whether an element overflows **itself**, and
that is not the same question. A figure or a chart can sit entirely inside its
own box while hanging out through the side of the card holding it — the check
reports clean and the page still looks broken.

The script runs a second pass for this: every child's rect against its
container's **padding box**, at every width. Two real finds from one sitting,
both invisible to the first pass:

- A sparkline carrying `width={72}` as an **SVG attribute** stayed 72px
  however narrow its tile became and pushed out through the card's right edge.
  An SVG sized by attribute does not shrink; size it with a class and let the
  viewBox scale.
- A seven-figure money value escaping at 440px, because the grid went
  two-up while each tile was still too narrow for the number.

**Adjust the container selector to whatever the app calls a card.** And keep
half a pixel of tolerance: subpixel layout puts a child a hair past its parent
constantly without anything being wrong.

## The third clipping question: is something sitting ON TOP of it?

The two passes above ask whether an element overflows itself and whether it
escapes its card. Both can come back clean while a figure is half invisible,
because **another element is painted over it**. Sticky and pinned cells,
sticky headers and anything in the top layer all do this, and nothing about the
covered element's own geometry changes when it happens.

Two real ones, from one page:

- A balance column pinned to the right of a scrolling table, offset by
  `right: 3rem` to clear the action column beside it. That column is 3rem of
  button **plus the cell's own padding** — 68px, not 48px — so the last 8px of
  every figure was painted underneath it. `Rs 1,781,910` lost its final digit
  on a phone and every automated check passed.
- A confirm dialog inheriting `text-align: right` and `white-space: nowrap`
  from the table cell that opened it, and running off its own panel.

Two habits that catch it:

- **A sticky offset is a number, so prefer an arrangement with no number to
  get wrong.** A pinned figure and its row action in *one* cell at `right: 0`
  cannot be misaligned; two cells with a computed offset can. It also keeps the
  action reachable — a figure pinned alone at `right: 0` sits over the action
  at every scroll position.
- **Compare rects between siblings, not just within one element.** For each
  pinned cell, assert that its text's right edge is left of the next pinned
  cell's left edge. And screenshot it, because the arithmetic can be right and
  the result still ugly.

## The fourth question: are the spaces still there?

No clipping check notices a missing space, and a screenshot at thumbnail size
hides it. In JSX, an HTML entity (`&rsquo;`, `&mdash;`) anywhere in a run of
text can make the compiler trim the space after a closing tag earlier in that
same run: "the stock **sold**over these days" shipped past a clean render
check. Type the character itself, or put `{' '}` after the tag, and grep the
server HTML for a closing inline tag followed directly by a letter (an icon
beside its label in a flex row matches too, so read each hit):

```bash
curl -s http://localhost:3000/devcheck | grep -oE '</(span|strong|b|a)>[A-Za-z]{2}' | sort | uniq -c
```

## Verify state changes with a before/after table, not a screenshot

For logic — which rows get a warning badge, which of two conditions fires —
extract the real rows and run both the old and new condition over them:

```
1·A  saved=true   before=true   after=false  -
2·B  saved=false  before=true   after=true   back-filling under a later day
```

"Six flagged before, one after, and it is the row that genuinely has a problem"
is a much stronger claim than a screenshot of a badge that disappeared. It also
documents itself into the commit message.

## When the claim is alignment, print the numbers as well

"These cards are now one height" is a number, so print it: each card's height,
row by row, before and after (`280, 331` → `348, 348`). Then look anyway,
because the numbers only answer the question they were asked. Two cards of
equal height still had their footer rules 9px apart; the screenshot showed it,
and a second measurement (the footer rows, 45px against 54px) found why: a
`min-h` sitting on the element that carried the padding, so `border-box`
counted the padding and the rule did nothing.

## Watch for the ground moving

If the owner is using the app while you work, the data changes under you. A
test that "fails" may be measuring a row someone just deleted. When a
verification result surprises you, re-query the data before concluding the code
is broken — and if the state has changed, say so rather than quietly adjusting.

Prefer tests that build their own fixture inside a rolled-back transaction over
tests that depend on today's live rows.

## Build before committing

`npm run build` catches typo'd imports, duplicate imports after an edit, and —
in projects with JSDoc-driven checks — type errors, even in a plain JavaScript
codebase. It is faster than discovering any of those in a deployment.

A trap worth knowing: a JSDoc comment containing `*/` inside it — writing
`h-*/w-*` to mean two utility classes — closes the comment early and produces a
baffling parse error several lines later.
