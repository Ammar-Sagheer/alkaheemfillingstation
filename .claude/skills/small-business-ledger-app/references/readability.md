# Designing for the person holding the tablet

**Ask who the reader is before using any number in this file** — `SKILL.md` §0
is the first step of any design work, and the scale below is the answer for the
*older, less screen-confident* reader. A phone-native audience can take denser
tables and a 14px body.

The default assumed here: the owner or an attendant, on a cheap tablet, in a
back room, in evening light, checking a figure against notes in a drawer. They
may be in their fifties or sixties and have used a paper register for twenty
years. None of this is an accessibility afterthought — it is the primary use
case. When both audiences share the app, design for this one; the younger
reader loses nothing to a 16px figure, and the older one loses the app entirely
to 13px grey text.

Two rules hold for **every** audience: money and quantities never wrap or
clip, and colour is never the only carrier of meaning.

## The data is bigger than the chrome

The most common failure, and the easiest to check: **a figure someone verifies
must never be smaller than the label describing it, or than a decorative
heading.**

A real measurement from a screen that had drifted:

| Element | Size | Verdict |
|---|---|---|
| Page title "Daily readings" | 24px bold | tells the reader nothing new |
| Nav labels | 14px | |
| **The figures checked against cash** | **14px** | the actual content |
| Their captions | **10.4px** uppercase grey | says which figure is which |

The chrome was larger than the data. A workable scale:

- body and table cells **16px**, not 14
- a figure inside a row **18px**
- a headline figure in a stat tile **24px**
- captions **12px floor** — never smaller
- buttons and nav items `py-3` or taller, giving a ~48px tap target

## Contrast has a floor

Mid grey on white measures around 4.7:1. That technically passes the
accessibility minimum, but the minimum assumes normal-size text, and these are
usually the *smallest* items on the page. In poor light it is the first thing
to disappear.

- anything meant to be read: **darken to roughly 7:1**
- reserve the palest grey for genuinely secondary text
- the very palest (~2.6:1) is for disabled controls and placeholders only —
  never for a word like "(optional)" that carries meaning

## Numbers

**Never let money wrap, truncate, or clip.** "Rs 4,386,211" breaking after the
"Rs" reads for a moment as two separate figures. Use `whitespace-nowrap` and
let the *layout* give way — drop a four-column grid to two, or to one below
about 380px. Fewer columns, never fewer digits.

**Use tabular numerals** everywhere figures stack, so columns align and a
mistyped digit changes the shape of the number.

**Fixed decimals for anything read off a dial.** A meter reading is a physical
dial with a tenths digit: `1,987,128.80` and `1,987,279.95` are the same shape
of number, and a bare `maximumFractionDigits` drops the trailing zero and
renders one a digit shorter than the other. In a tabular font whose whole job
is alignment, that is how a digit gets misread.

Quantities are different — `218.9 L` is fine. Reserve the fixed-decimal
formatter for dial positions, and keep the two formatters separate and named.

**Put the unit in the caption, not the figure**, when space is tight.
"Rs 336.34 / litre" truncating to "Rs 336.34 / lit…" hides part of a number to
make room for a unit that never changes. Caption it "Rate a litre" and show
"Rs 336.34".

## Icons never carry meaning alone

An icon beside a word is a second, redundant cue — shape on top of the word and
the colour. That matters here because colour is the cue that fails in dim light
and for a red-green colourblind reader (about 1 in 12 men).

The status that fails hardest is two words differing by two letters, told apart
mainly by amber vs green — "Enter" and "Entered". Add a tick and a pencil and
the difference becomes shape as well.

- every icon sits next to its own label, and is `aria-hidden`
- do not icon everything: badges already differing in both word and colour gain
  nothing from a shared glyph
- hand-drawn inline SVG on one grid beats an icon package for a set this small,
  and keeps every icon on the same stroke weight

## Texture: nothing smaller than the thing it sits on

Decoration on a surface an older reader looks past all day has a frequency
limit. Fractal grain and 1px hairlines are **high-frequency** detail — at the
scale of a pixel or two — and on a cheap tablet they shimmer as the panel
scrolls, can moiré against the screen's own pixel grid, and give a 40-plus eye
something to keep trying to focus on that is not there. A type and contrast
floor built for that reader is undone by sandpaper behind his headings.

If a surface wants depth, use washes measured in **hundreds** of pixels — a
broad sheen, a matching falloff, one very wide sweep. Keep the only fine
detail on the **edge** (a 1px bevel), which is read once rather than scanned.

**Depth is stacked shadows, not one big one**: a tight contact shadow where the
object meets the page, a mid one for the body of the lift, a wide ambient one,
and a light hairline inset along the top edge. The eye reads the combination
as height and any single one as a blur. Lift one thing on a page — if
everything is raised, nothing reads as raised.

## Say which day is on screen, once and loudly

Any screen where data is entered *against a date* needs the date stated
prominently and only once. Three quiet statements of the same fact — a page
description, a native date box, a small caption — leave none of them dominant,
and the owner loses track and enters a day against the wrong date.

- one tinted banner, larger than anything else in the block
- **include the weekday.** A row of digits is skimmed past; "Thursday" is
  checkable against the day the reader actually lived
- tint it whenever it is *not* today — grey for past, amber for future
- always label it, including an ordinary past day. A date with no label looks
  identical to today at a glance

A native `<input type="date">` is drawn in the **browser's** locale, which no
markup can change. On an en-US browser the 7th of August renders `08/07/2026`,
which a day-first reader sees as the 8th of July. Do not let that box be the
statement of which day is on screen — demote it to a jump control and let the
written date carry it.

## Grouping

When rows belong to a physical thing — two nozzles on one unit, three bays in a
workshop — **let spacing carry the grouping**: a large gap between groups, a
small one within. The heading only names what the spacing already showed.

Then drop the repetition the grouping makes redundant. With a "Unit 1" heading
above them, the cards can say "Nozzle A" and "Nozzle B". But shorten a label
only where the context replacing it is on screen — a dialog opening over the
whole page keeps the full "Unit 1 · Nozzle A", because the heading is no longer
visible and that is the moment being sure matters most.

A group can carry its own progress — "1 of 2 entered", turning green when
complete — so a finished group is skipped without reading its rows.

## Navigation

Around ten sections with icons and readable labels need roughly 1350px laid out
horizontally. Most pages cap content well below that, so a top tab row either
scrolls (hiding the last sections off the right edge of every laptop) or wraps
onto a second row. A vertical sidebar has no such squeeze: every section is
visible at once, which is what someone still learning the app needs, and each
gets a full-width band to hit rather than a word.

It costs horizontal room — expect the widest table to start scrolling inside
its card at tablet widths. That is usually the right trade, but say so in the
code comment so the next person knows it was chosen rather than overlooked.

Below tablet width, a burger opening a drawer. Build the drawer on the native
`<dialog>` with `showModal()` — focus trapping, Escape and an inert background
come from the browser already correct. Close it when the *pathname changes*,
not on the click: closing on click pulls it away while the next page is still
loading, and the pending spinner on the link is the only feedback there is.

## When breakpoints stop meaning what you think

Once a fixed sidebar exists, viewport width and content width are different
numbers — at a 1024px window the content may have 768px. `lg:grid-cols-4` then
gives each tile 192px and the big figures run into their dividers.

Use container queries for anything laid out inside the content area, so the
column count follows the space the component actually has. And prefer one
shared stat/tile component: three hand-rolled copies of the same strip means
the same latent bug in three places.
