# public/

Files here are served from the site root: `public/logo.png` is `/logo.png`.

## logo.png

The mark shown in the sidebar, in the top bar and on the login screen, above the
business name, and printed at the head of every customer statement (PDF).
Supplied by hand — save the green version here.

Use the green one on purpose: this sits on white, where a transparent
mark floats and a solid tile reads as a logo. The tab icon is the opposite case
and is transparent, because it sits on browser chrome that changes colour with
the theme. The two wanting opposite things is why they are separate files.

Keep it small. The largest it is ever drawn is 64px, on the login screen; the
sidebar and the top bar show it at 40px, and the top bar at 32px on a phone
narrower than 400px (`BrandMark` in `AdminSidebar.js`, sizes as of the new
look, September 2026). So a few hundred pixels wide is ample: the 1.1 MB
original was being downloaded in full on every page load to be drawn at a
fraction of its size. Trimming the empty margin around the mark helps too: it
takes nothing off the logo and lets it fill the space.

**The file's size is also most of every statement's size.** The PDF embeds it
at full resolution to draw it 38pt tall: at 480x350 and 145KB it is nearly all
of a statement's ~145KB, and the same statement without it is about 8KB
(`statement-pdf.js` says so at the top). Statements go out over WhatsApp, so a
smaller logo is a smaller statement.

## Browser icons

`app/favicon.ico`, `app/icon.png` and `app/apple-icon.png` are **generated** —
do not hand-edit them:

```sh
pip install pillow
python3 scripts/build-icons.py --source brand/logo-lockup.png --margin 0
```

`--margin 0` squares the canvas around the mark without taking anything off it:
the logo is 1.38:1, so it fills the full width and is letterboxed top and
bottom. **Nothing is cropped** — which is the point, and why `--bleed` is not
used here, since that gains height only by shaving the outermost edges.

Spare artwork lives in `brand/`, outside `public/`, so 1.4 MB masters are not
served to every visitor. `public/` holds only what the site actually sends.

There is also a `--tile "#28ac28"` option, which writes `public/logo.png` as the
mark centred on a coloured tile. Not used — the logo is supplied by hand — but
it is there if you would rather generate it. Give it the **transparent** source
either way: the tile colour is added by the script, and a logo with a background
already baked in cannot be un-backgrounded.

Next.js picks all three up from `app/` by filename; there is nothing to wire up.

### Why a script rather than renaming the logo to favicon.ico

Because that is what was there before, and it looked tiny in the tab. Two
reasons, and the script explains both in its own header:

* **Padding.** The logo was centred in a square canvas with wide empty margins.
  A browser draws a favicon at 16px, so a mark covering 57% of the canvas height
  was being drawn about 9px tall inside a 16px box. Removing the empty margin —
  which takes nothing off the logo itself — draws it at ~11.6px instead.
* **File size.** `favicon.ico` was a 1.1 MB PNG with the extension changed. The
  generated one is a real multi-size ICO at ~7 KB.

### A .ico is not a renamed .png

`favicon.ico` has twice been a PNG with the extension changed — once at 1.1 MB,
once at 339 KB, both times byte-identical to `icon.png` beside it. It mostly
works, because browsers sniff the content, but it wastes the format: a real ICO
holds **several sizes in one file**, so the browser picks 16, 32 or 48 instead
of resampling one big image down every time. The generated one is 6 KB and
carries all three.

### The canvas has to be square

A browser draws favicons into a square slot. Hand it 859x644 and something has
to give — letterboxing if you are lucky, cropping if you are not, and it is not
your choice which. Squaring it here settles it: the mark is centred on a square
canvas, full width, transparent above and below.

That costs height, unavoidably. At 1.38:1 the logo can be 16 wide by 12 tall and
no more, with those 12 pixels shared between the flower and the wordmark, so
"go" reads as a red mark rather than as letters. It resolves at 32px and above.
`--symbol-only --repair-folds 5` is the alternative — the flower alone, which is
square and fills all 16x16 — kept in the script and deliberately not used.

### `--repair-folds 5`

Taking "go" off leaves a hole. The "g" overlapped a petal, so removing its ink
removes that piece of the flower with it, and one petal comes out with a bite
missing.

The flower has five petals arranged rotationally, which means the missing piece
still exists on the mark — it is just sitting 72° away. So the symbol is rotated
onto itself and the hole is filled from whichever rotation has ink there.

Only inside the hole, deliberately: unioning all five rotations everywhere does
rebuild the bite, but it also nicks the intact petal tips, because a rotation is
a resample and never lands exactly back on the original pixels.

### `--alpha-floor`

Raise it when the source has a soft drop shadow. A shadow is still visible
pixels, so the default trim measures the artwork larger than it looks — on one
of the flower masters it read as 0.76:1 instead of 1.02:1, which would have
given away a quarter of the icon to empty space.

### Sharpening

Each ICO size is sharpened **after** it is resized, at its own scale, which is
why the icons are packed by hand rather than by Pillow's `save(sizes=...)` —
that resizes internally from one image and treats every size the same. A 16px
icon needs it badly and a 48px one barely. It does more for legibility than size
does.
