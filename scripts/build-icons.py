#!/usr/bin/env python3
"""
Turns the logo into browser icons that actually fill a browser tab.

    pip install pillow
    python3 scripts/build-icons.py                 # auto-trim the whole mark
    python3 scripts/build-icons.py --box 0,0,.45,1 # just the left part of it

WHY THIS EXISTS

A logo drawn for a letterhead does not work as a favicon, for two reasons that
look like one:

  1. PADDING. Artwork is usually centred in a big square canvas with wide
     margins. A browser draws a favicon at 16 or 32 pixels, so those margins are
     not a small waste - if the mark covers 60% of the canvas, it is being drawn
     at 10px inside a 16px box, and it reads as tiny next to icons that go
     edge to edge. This script measures the real ink and crops to it.

  2. DETAIL. Sixteen pixels will not hold a five-petal outline and a two-letter
     wordmark. The icons that look sharp in a tab - Vercel's triangle is the
     obvious one - are a single bold shape and nothing else. Cropping cannot
     invent that, so --box takes a region of the source: point it at the
     symbol on its own and drop the wordmark, which is unreadable at that size
     anyway and only makes the symbol smaller.

WHAT IT WRITES

    app/favicon.ico     16 / 32 / 48, what the tab uses
    app/icon.png        512, what Next links for higher-resolution uses
    app/apple-icon.png  180, the home-screen icon on iOS

and with --tile, the in-app logo as well:

    public/logo.png     the mark on a coloured tile, for the navbar and login

The tab icon and the in-app logo want opposite things, which is why they are
separate outputs from the same source. A tab icon sits on the browser's own
chrome, light or dark depending on the theme, so it has to be transparent. The
in-app logo sits on a white header, where a transparent mark floats and a solid
tile reads as a logo.

All three come from one source, so they cannot drift apart. Next.js picks these
up from app/ by filename convention - there is nothing to wire up.
"""
import argparse
import os
import sys
from collections import deque

try:
    from PIL import Image, ImageChops, ImageFilter
except ImportError:
    sys.exit("Pillow is needed: pip install pillow")

SOURCE = os.path.join("public", "logo.png")
OUT_DIR = "app"

# Default floor for "is this pixel part of the mark". Overridable, because a
# soft drop shadow is technically visible pixels and will hold the bounding box
# open well past the artwork - the flower here is square, but its shadow made it
# measure 0.76:1 and would have cost a quarter of the icon.
ALPHA_FLOOR = 24
# How far a colour has to be from the background colour to count as ink. Wide
# enough to survive the gradient in a flat-looking backdrop, narrow enough that
# a dark outline against it still registers.
COLOUR_TOLERANCE = 90


def content_box(image, alpha_floor=ALPHA_FLOOR):
    """
    The bounding box of the actual mark.

    Two kinds of source turn up and they need different handling. A transparent
    PNG is easy - the alpha channel already says what is mark and what is not.
    An opaque one has the background baked in, and it is not necessarily white:
    this logo ships on a green field, so trimming "everything near white" would
    trim nothing at all and report the mark as filling the whole canvas.

    So when there is no usable alpha, the background colour is read off the
    corners and anything close to it is treated as backdrop.
    """
    rgba = image.convert("RGBA")
    alpha = rgba.getchannel("A")

    if alpha.getextrema()[0] < 255:
        box = alpha.point(lambda a: 255 if a > alpha_floor else 0).getbbox()
        if box:
            return box

    w, h = rgba.size
    corners = [rgba.getpixel(p) for p in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1))]
    backdrop = tuple(sum(c[i] for c in corners) // len(corners) for i in range(3))

    rgb = rgba.convert("RGB")
    ink = Image.new("L", rgba.size, 0)
    ink.putdata([
        255 if (abs(r - backdrop[0]) + abs(g - backdrop[1]) + abs(b - backdrop[2])) > COLOUR_TOLERANCE
        else 0
        for r, g, b in rgb.getdata()
    ])

    return ink.getbbox() or (0, 0, w, h)


def wordmark_mask(image):
    """
    Where the red wordmark was, grown a little.

    Grown because the glyphs were drawn with a white outline which comes off
    with them, so the hole is slightly bigger than the red ink itself and the
    seam needs repairing too.
    """
    rgba = image.convert("RGBA")
    w, h = rgba.size
    px = rgba.load()

    mask = Image.new("L", (w, h), 0)
    mp = mask.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a > ALPHA_FLOOR and r > 120 and r - g > 60 and r - b > 60:
                mp[x, y] = 255

    return mask.filter(ImageFilter.MaxFilter(9))


def symbol_only(image):
    """
    The flower on its own, with the "go" taken off.

    Sixteen pixels will not hold the whole lockup - rendered at that size the
    wordmark is a red smudge, and worse, being wide it forces the symbol to be
    drawn smaller so the pair can fit. Dropping it lets the flower fill the
    square, which is the whole reason Vercel's tab icon is the triangle and not
    the word.

    Done in two passes because neither alone is enough. Red ink goes first,
    which takes the glyphs but leaves the white outline that was drawn around
    them. Then the largest remaining island of pixels is kept - that is the
    flower, and the stranded outline fragments are dropped with everything else.
    """
    rgba = image.convert("RGBA")
    w, h = rgba.size
    px = rgba.load()

    keep = bytearray(w * h)
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a <= ALPHA_FLOOR:
                continue
            if r > 120 and r - g > 60 and r - b > 60:
                continue
            keep[y * w + x] = 1

    # Flood fill rather than a library: one dependency is enough for a script
    # that runs once. A megapixel takes a few seconds, which is fine offline.
    seen = bytearray(w * h)
    best, best_size = [], 0
    for start in range(w * h):
        if not keep[start] or seen[start]:
            continue
        queue = deque([start])
        seen[start] = 1
        island = [start]
        while queue:
            i = queue.popleft()
            x0, y0 = i % w, i // w
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                x1, y1 = x0 + dx, y0 + dy
                if 0 <= x1 < w and 0 <= y1 < h:
                    j = y1 * w + x1
                    if keep[j] and not seen[j]:
                        seen[j] = 1
                        queue.append(j)
                        island.append(j)
        if len(island) > best_size:
            best, best_size = island, len(island)

    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    op = out.load()
    for i in best:
        x, y = i % w, i // w
        op[x, y] = px[x, y]
    return out


def repair_symmetry(symbol, damage, folds):
    """
    Rebuilds the part of the symbol the wordmark was sitting on top of.

    Taking the "go" off leaves a hole: the "g" overlapped a petal, so removing
    its ink removes that piece of the flower with it and one petal comes out
    with a bite missing.

    The flower has `folds` petals arranged rotationally, which means the missing
    piece still exists on the mark - it is just sitting at some multiple of
    360/folds degrees away. So the symbol is rotated onto itself and the hole is
    filled from whichever rotation has ink there.

    Only inside `damage`, deliberately. Unioning all the rotations everywhere
    rebuilds the hole but also nicks the intact petal tips, because the rotation
    is a resample and never lands exactly on the original pixels. Confining it
    to where the wordmark actually was leaves the other four petals untouched.
    """
    rgba = symbol.convert("RGBA")
    w, h = rgba.size

    # Rotate about the mark's own centre of mass, not the middle of its box -
    # a bitten petal drags the bounding box off centre, and rotating about the
    # wrong point smears the repair.
    alpha = rgba.getchannel("A")
    total = sx = sy = 0
    for y in range(h):
        row = alpha.crop((0, y, w, y + 1)).tobytes()
        for x, a in enumerate(row):
            if a > 128:
                total += 1
                sx += x
                sy += y
    if not total:
        return symbol
    cx, cy = sx / total, sy / total

    radius = int(max(w, h) * 0.75)
    def centred(img):
        canvas = Image.new(img.mode, (2 * radius, 2 * radius),
                           (0, 0, 0, 0) if img.mode == "RGBA" else 0)
        canvas.paste(img, (round(radius - cx), round(radius - cy)))
        return canvas

    big, hole = centred(rgba), centred(damage)
    out = big.copy()
    for k in range(1, folds):
        turned = big.rotate(360 * k / folds, resample=Image.BICUBIC,
                            center=(radius, radius))
        gain = ImageChops.subtract(
            turned.getchannel("A"), out.getchannel("A")
        ).point(lambda v: 255 if v > 8 else 0)
        out = Image.composite(turned, out, ImageChops.multiply(gain, hole))

    box = out.getchannel("A").getbbox()
    return out.crop(box) if box else out


def write_ico(path, image, sizes, sharpen):
    """
    A multi-size .ico, written by hand.

    Pillow's own ICO save resizes internally from one image, which means every
    size gets the same treatment. Sharpening has to happen after the resize and
    at each size's own scale - a 16px icon needs it badly, a 48px one barely -
    so the entries are rendered here and packed manually. An ICO is only a
    header, a directory, and the PNGs themselves.
    """
    import io
    import struct

    payloads = []
    for size in sizes:
        frame = image.resize((size, size), Image.LANCZOS)
        if sharpen:
            frame = frame.filter(
                ImageFilter.UnsharpMask(radius=0.6, percent=sharpen, threshold=0)
            )
        buffer = io.BytesIO()
        frame.save(buffer, format="PNG", optimize=True)
        payloads.append((size, buffer.getvalue()))

    header = struct.pack("<HHH", 0, 1, len(payloads))
    offset = len(header) + 16 * len(payloads)
    directory, blobs = b"", b""
    for size, blob in payloads:
        # 0 means 256 in an ICO directory; nothing here is that big, but the
        # rule is the rule.
        directory += struct.pack(
            "<BBBBHHII", size % 256, size % 256, 0, 0, 1, 32, len(blob), offset
        )
        offset += len(blob)
        blobs += blob

    with open(path, "wb") as handle:
        handle.write(header + directory + blobs)


def square(image, margin):
    """Centres the mark on a transparent square, leaving `margin` around it."""
    side = int(max(image.size) * (1 + margin * 2))
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(
        image,
        ((side - image.width) // 2, (side - image.height) // 2),
        image if image.mode == "RGBA" else None,
    )
    return canvas


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", default=SOURCE, help=f"default {SOURCE}")
    parser.add_argument(
        "--box",
        help="region of the SOURCE to use, as fractions left,top,right,bottom "
             "- e.g. 0,0,.45,1 for the left 45%%. Use it to take the symbol on "
             "its own and leave the wordmark out.",
    )
    parser.add_argument(
        "--repair-folds", type=int, default=0, metavar="N",
        help="with --symbol-only: rebuild the piece of the symbol the wordmark "
             "was covering, using the symbol's own N-fold rotational symmetry. "
             "5 for this flower.",
    )
    parser.add_argument(
        "--alpha-floor", type=int, default=ALPHA_FLOOR,
        help="how opaque a pixel must be to count as part of the mark when "
             "trimming. Raise it to trim off a soft drop shadow, which is "
             "decorative at full size and only muddies a 16px icon.",
    )
    parser.add_argument(
        "--symbol-only", action="store_true",
        help="keep the flower and drop the wordmark. Recommended - it is what "
             "makes the icon fill a 16px tab instead of sitting in it.",
    )
    parser.add_argument(
        "--bleed", type=float, default=0.0,
        help="scale the mark past the square by this fraction, clipping its "
             "extreme edges. A wide lockup in a square icon is limited by its "
             "width, so a little bleed is the only way to gain height. 0.08 "
             "shaves under a pixel at tab size and is not visible.",
    )
    parser.add_argument(
        "--sharpen", type=int, default=130,
        help="unsharp strength applied to each small icon AFTER it is resized. "
             "This is what makes a 16px icon read as crisp rather than smudged, "
             "and it matters more than size. 0 turns it off.",
    )
    parser.add_argument(
        "--tile", metavar="#RRGGBB",
        help="also write public/logo.png as the mark centred on a tile of this "
             "colour, for use inside the app.",
    )
    parser.add_argument(
        "--tile-inset", type=float, default=0.06,
        help="breathing room inside the tile, as a fraction. Default 0.06 - "
             "tighter and the mark touches the corners, looser and it floats.",
    )
    parser.add_argument(
        "--margin", type=float, default=0.04,
        help="breathing room around the mark, as a fraction. Default 0.04 - "
             "small on purpose, since the point is to fill the tab.",
    )
    args = parser.parse_args()

    if not os.path.exists(args.source):
        sys.exit(f"No logo at {args.source}. Save it there first.")

    image = Image.open(args.source).convert("RGBA")
    original = image.size

    if args.box:
        try:
            left, top, right, bottom = (float(v) for v in args.box.split(","))
        except ValueError:
            sys.exit("--box wants four numbers: left,top,right,bottom")
        image = image.crop((
            int(left * image.width), int(top * image.height),
            int(right * image.width), int(bottom * image.height),
        ))

    if args.symbol_only:
        wordmark = wordmark_mask(image)
        image = symbol_only(image)
        if args.repair_folds:
            image = repair_symmetry(image, wordmark, args.repair_folds)
            print(f"repaired         {args.repair_folds}-fold, where the wordmark overlapped")

    box = content_box(image, args.alpha_floor)
    trimmed = image.crop(box)

    if not trimmed.width or not trimmed.height:
        sys.exit("Nothing left after trimming - is the logo blank?")

    icon = square(trimmed, args.margin)

    if args.bleed:
        # Shrink the canvas around the mark rather than growing the mark, which
        # comes to the same thing and keeps the mark at full resolution.
        side = round(max(trimmed.size) / (1 + args.bleed))
        bled = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        bled.paste(
            trimmed,
            ((side - trimmed.width) // 2, (side - trimmed.height) // 2),
            trimmed,
        )
        cut = (max(trimmed.size) - side) / 2
        print(f"bleed {args.bleed:.0%}      shaves {cut / trimmed.width:.1%} off each side "
              f"({16 * cut / trimmed.width:.2f}px at tab size)")
        icon = bled

    # How much of the canvas the mark occupied before, and does now. The first
    # number is the answer to "why does it look so small".
    was = (box[2] - box[0]) * (box[3] - box[1]) / (original[0] * original[1])
    now = (trimmed.width * trimmed.height) / (icon.width * icon.height)
    print(f"source            {original[0]}x{original[1]}")
    print(f"ink found at      {box}")
    print(f"filled the canvas {was:.0%}  ->  {now:.0%}")

    os.makedirs(OUT_DIR, exist_ok=True)

    ico = os.path.join(OUT_DIR, "favicon.ico")
    write_ico(ico, icon, (16, 32, 48), args.sharpen)
    print(f"wrote {ico}")

    # Never upscale. Blowing a 279px mark up to 512 only invents soft pixels;
    # a smaller, sharp icon is worth more than a larger, mushy one.
    png_size = min(512, icon.width)
    png = os.path.join(OUT_DIR, "icon.png")
    icon.resize((png_size, png_size), Image.LANCZOS).save(png, optimize=True)
    print(f"wrote {png}  ({png_size}px" +
          ("" if png_size == 512 else ", capped at the source rather than upscaled") + ")")

    apple = os.path.join(OUT_DIR, "apple-icon.png")
    # iOS draws no transparency, so flatten onto white rather than black.
    flattened = Image.new("RGBA", icon.size, (255, 255, 255, 255))
    flattened.paste(icon, (0, 0), icon)
    apple_size = min(180, icon.width)
    flattened.convert("RGB").resize((apple_size, apple_size), Image.LANCZOS).save(
        apple, optimize=True
    )
    print(f"wrote {apple}")

    if args.tile:
        colour = args.tile.lstrip("#")
        if len(colour) != 6:
            sys.exit("--tile wants a colour like #28ac28")
        rgb = tuple(int(colour[i:i + 2], 16) for i in (0, 2, 4))

        side = 320
        tile = Image.new("RGBA", (side, side), (*rgb, 255))
        room = int(side * (1 - args.tile_inset * 2))
        scale = min(room / trimmed.width, room / trimmed.height)
        fitted = trimmed.resize(
            (round(trimmed.width * scale), round(trimmed.height * scale)), Image.LANCZOS
        )
        tile.paste(fitted, ((side - fitted.width) // 2, (side - fitted.height) // 2), fitted)

        logo = os.path.join("public", "logo.png")
        os.makedirs("public", exist_ok=True)
        tile.save(logo, optimize=True)
        print(f"wrote {logo}  (mark fills {fitted.width * fitted.height / side ** 2:.0%} of the tile)")


if __name__ == "__main__":
    main()
