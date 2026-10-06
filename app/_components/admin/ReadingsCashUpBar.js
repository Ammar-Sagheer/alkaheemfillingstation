'use client';

import { useEffect, useState } from 'react';

/**
 * The day's running totals, pinned to the bottom of the screen while the
 * nozzles are being entered.
 *
 * ---------------------------------------------------------------------------
 * WHY IT EXISTS, AND WHY IT IS NOT A SECOND COPY OF THE TILES
 * ---------------------------------------------------------------------------
 * The figures on this bar are the same four the stat tiles carry at the top of
 * the page, and showing both at once would be exactly the duplication the
 * conventions warn about - "say it once", the note that got the date down from
 * three simultaneous statements to one.
 *
 * So this is not shown at once. It appears ONLY WHEN THE TILES HAVE SCROLLED
 * OUT OF VIEW, and hides again the moment they come back. At any given moment
 * the day's totals are on screen exactly once; which of the two carries them
 * depends on where the reader has got to.
 *
 * That is worth the machinery because of what this page is for. The last
 * nozzle is a long way down a six-row page, and the question being answered
 * while typing into it is "does this match the notes in the drawer" - a
 * question about the day's total, asked at the point furthest from where the
 * day's total used to be. Before this, checking meant scrolling back up, which
 * is why the dialog carried its own little running total: the page's own
 * figures were unreachable from inside the task.
 *
 * ---------------------------------------------------------------------------
 * AN OBSERVER, NOT A SCROLL HANDLER
 * ---------------------------------------------------------------------------
 * `IntersectionObserver` fires only when the tiles actually cross the edge of
 * the viewport, off the main thread. A scroll listener would run on every
 * frame of every scroll to answer the same question, on a cheap tablet, on the
 * screen this app is used on most.
 *
 * `SUPPRESSED WHEN NOTHING IS ENTERED`. On a fresh day every figure is zero
 * and the bar would be a strip of "Rs 0" following the reader down a page they
 * have not started - the same fault the top tiles have on an empty day, but
 * this one moves. It appears with the first saved nozzle.
 */
export default function ReadingsCashUpBar({ watchId, entered, total, litres, cash, credit }) {
  const [showing, setShowing] = useState(false);

  useEffect(() => {
    const tiles = document.getElementById(watchId);
    if (!tiles) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => setShowing(!entry.isIntersecting),
      // A hair of margin, so the bar does not flicker in and out while the
      // tiles sit exactly on the edge of the viewport.
      { rootMargin: '-8px 0px 0px 0px' },
    );

    observer.observe(tiles);
    return () => observer.disconnect();
  }, [watchId]);

  if (entered === 0) return null;

  const allDone = entered === total;

  return (
    <div
      /*
       * `.nav-offset` is the admin layout's own sidebar offset, so the bar
       * starts where the content does rather than running underneath the nav.
       * It is a shared class for exactly this reason: this file carried its own
       * copy of the breakpoint, the layout's copy moved, and the bar sat
       * indented 240px for a column that was no longer there. One rule now,
       * in globals.css, and the reader's pinned/put-away choice reaches both.
       *
       * aria-hidden while it is off screen, so a screen reader is not read the
       * same four figures twice - it already has them from the tiles.
       */
      aria-hidden={!showing}
      className={`pointer-events-none nav-offset fixed inset-x-0 bottom-0 z-30
                  transition-transform duration-200 ease-out
                  ${showing ? 'translate-y-0' : 'translate-y-full'}`}
    >
      {/* The same cap as the admin <main>, and it has to stay the same: this
          bar is fixed to the bottom of the window, so any disagreement shows
          up as the bar's edges not lining up with the table it is summing. */}
      <div className="@container mx-auto w-full max-w-[85rem] px-4 pb-3">
        {/* A white panel now, not the near-black strip it was: the new look
            has no black surfaces. What keeps it reading as a separate thing
            floating over the page is the lift - a hairline and a strong
            shadow - rather than inverted colour. */}
        <div
          className="pointer-events-auto flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl bg-white px-5 py-3 ring-1 ring-ink-900/10"
          style={{ boxShadow: '0 -2px 6px rgb(15 23 42 / 0.06), 0 12px 32px -8px rgb(15 23 42 / 0.30)' }}
        >
          {/* Progress first, because it answers "am I finished" - and it is
              the one figure here the tiles state as a fraction rather than as
              money, so it never reads as a total. */}
          <span
            className={`badge shrink-0 ${
              allDone ? 'bg-brand-100 text-brand-800' : 'bg-ink-100 text-ink-800'
            }`}
          >
            {entered} of {total} entered
          </span>

          {/* LITRES DROP OUT ON A PHONE. All four figures wrapped to three
              lines at 400px - about 90px of a short screen, permanently, over
              the row being typed into. The question this bar exists to answer
              is "does this match the notes in the drawer", and litres are the
              one figure that answers none of it. Cash and credit stay at every
              width. A container query, not `sm:` - the bar is inset by the
              sidebar on a laptop, so its width and the window's are not the
              same number (see "Responsive: measure the container"). */}
          <BarFigure label="Sold" value={litres} className="hidden @[30rem]:flex" />
          <BarFigure label="Cash" value={cash} />
          <BarFigure label="Credit" value={credit} />
        </div>
      </div>
    </div>
  );
}

/**
 * One figure on the bar.
 *
 * The new look's pair: a sentence-case caption and a 20px figure, so the strip
 * never becomes the one place in the app where a number is smaller than the
 * word describing it.
 */
function BarFigure({ label, value, className = '' }) {
  return (
    <span className={`flex min-w-0 items-baseline gap-2 ${className}`}>
      <span className="caption">{label}</span>
      <span className="tabular whitespace-nowrap text-xl font-bold text-ink-900">{value}</span>
    </span>
  );
}
