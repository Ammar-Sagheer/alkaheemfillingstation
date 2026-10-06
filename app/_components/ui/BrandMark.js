'use client';

import { useState } from 'react';

import { BUSINESS_INITIALS, LOGO_SRC } from '@/app/_lib/brand';

/**
 * The logo, with an initials tile behind it.
 *
 * SIZED BY HEIGHT ONLY. The caller says how tall, never how wide, and the logo
 * takes whatever width its own proportions ask for. A fixed square box has to
 * letterbox anything that is not square - the lockup here is about 1.4:1, so in
 * a 36px square it was drawn 36 wide by 26 tall and looked smaller than the
 * plain initials tile it replaced. Height-only means a square logo and a wide
 * one both come out the right size, and swapping the file for a differently
 * shaped one needs no code change.
 *
 * The initials fall back to a square, since two or three letters in a wide box
 * would sit in a lot of empty colour.
 *
 * WHY NOT onLoad / onError ALONE. The browser starts fetching the logo while
 * the server-rendered HTML is still parsing, so by the time React hydrates the
 * attempt has usually already settled - and a load or error event that has
 * already fired does not fire again. Relying on onError left a broken-image
 * icon in the header for good when the file was missing; relying on onLoad left
 * the initials showing for good when it was present. Both were tried here, and
 * both failed exactly that way. So the element is asked directly on mount:
 * `complete` says the attempt is settled, naturalWidth says whether it settled
 * as a picture. The handlers stay on for an image still in flight at hydration,
 * where they do fire normally.
 *
 * A plain <img> rather than next/image: one small fixed-size mark gives the
 * optimiser nothing to do, and next/image fails the build outright when the file
 * is absent - which is exactly the case this has to survive.
 *
 * Decorative throughout: the business name is written next to it every time it
 * is used, so alt is empty and the whole thing is hidden from screen readers.
 */
export default function BrandMark({ className = 'h-9' }) {
  const [shown, setShown] = useState(false);

  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex shrink-0 items-center justify-center
                  ${shown ? 'w-auto' : 'aspect-square rounded-lg bg-brand-600'} ${className}`}
    >
      {shown ? null : <span className="text-xs font-bold text-white">{BUSINESS_INITIALS}</span>}

      <img
        // Settled before hydration - the common case - so ask rather than wait.
        ref={(node) => {
          if (node?.complete) setShown(node.naturalWidth > 0);
        }}
        // Still loading at hydration; these fire normally.
        onLoad={(event) => setShown(event.currentTarget.naturalWidth > 0)}
        onError={() => setShown(false)}
        src={LOGO_SRC}
        alt=""
        // Full height, natural width. Hidden until it is known to be a real
        // picture, so a broken file never shows as a broken icon.
        className={`h-full w-auto object-contain ${
          shown ? 'opacity-100' : 'absolute inset-0 h-full w-full opacity-0'
        }`}
      />
    </span>
  );
}
