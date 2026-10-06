'use client';

import { useState } from 'react';

/**
 * The little trend line inside a stat tile, with a value-and-date readout on
 * hover.
 *
 * HAND-DRAWN SVG, NOT RECHARTS. The app has three real charts
 * (SalesTrendChart and friends) and they are all Recharts: axes, tooltips,
 * legends and a ResponsiveContainer that must measure itself in the browser
 * before it can draw. Four of those in a stat row would each ship a chart
 * bundle and each do a measure-then-paint, so the row the owner reads first
 * every morning would land empty and pop in a beat later. This is a path and
 * about forty lines of pointer maths, which is a different order of cost.
 *
 * IT IS A CLIENT COMPONENT, AND IT DID NOT USED TO BE. It was written
 * deliberately server-only, with a comment saying so, until the owner asked
 * for the value and date on hover - which cannot be done without JavaScript.
 * What that comment was actually defending was not "zero JavaScript", it was
 * "do not put a charting library in a stat tile", and that still holds. The
 * markup is still server-rendered on first paint, so there is no layout
 * shift; the hover state is all the client adds.
 *
 * THE FIGURE IS STILL NOT IN THE LINE. There is no axis and no scale, so
 * nothing here can be misread as a quantity - the shape says "rising",
 * "falling", "steady", and the tile's own 24px figure is beside it. The hover
 * readout is an extra, and a mouse-only one, so it must never be the only
 * route to a number: everything it shows is also in the trend charts further
 * down the page.
 *
 * `tips` is pre-formatted ON THE SERVER - `[{ v: 'Rs 1,204,950', d: '14 Aug' }]`.
 * A formatter cannot be passed across the server/client boundary, and the
 * alternative (shipping raw numbers and re-implementing PKR and litre
 * formatting in here) is how two parts of one app start disagreeing about how
 * a number is written. The caller already knows whether its series is money or
 * litres, so the caller formats and this only displays.
 */
export default function Sparkline({ data, tips, className = '', width = 72, height = 34 }) {
  const [active, setActive] = useState(null);

  const points = (data ?? []).map(Number).filter((n) => Number.isFinite(n));

  /* Two points is the minimum that can show a direction; one is a dot that
     says nothing, and none is a tile whose page has no series behind it yet.
     Both render nothing rather than an empty box, so a tile without data is
     simply a tile without a sparkline. */
  if (points.length < 2) return null;

  const min = Math.min(...points);
  const max = Math.max(...points);

  /* A flat series (every day identical) would divide by zero and then draw off
     the top of the box. Span of 1 puts the line through the middle instead,
     which is the honest picture of "no change". */
  const span = max - min || 1;
  const step = width / (points.length - 1);

  /* Inset by the stroke width top and bottom, or the peak and the trough are
     drawn with half the line hanging outside the viewBox and get clipped. */
  const pad = 2;
  const y = (value) => height - pad - ((value - min) / span) * (height - pad * 2);

  const line = points
    .map((value, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(2)},${y(value).toFixed(2)}`)
    .join(' ');

  const area = `${line} L${width.toFixed(2)},${height} L0,${height} Z`;

  const hoverable = Array.isArray(tips) && tips.length === points.length;

  /*
   * THE READOUT IS `fixed`, ANCHORED TO THE POINTER, NOT PLACED IN THE CARD.
   *
   * The sparkline sits hard against the card's right padding, so there is no
   * room inside the card for a panel to its right - and this component has
   * just been through one round of things escaping their cards. A fixed
   * overlay is outside the layout entirely: it cannot widen a card, push a
   * figure, or make the page scroll sideways, which a positioned-in-flow
   * tooltip could do all three of. It flips to the pointer's left near the
   * viewport edge so it does not run off screen either.
   */
  function onMove(event) {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width === 0) return;
    const ratio = (event.clientX - box.left) / box.width;
    const index = Math.min(points.length - 1, Math.max(0, Math.round(ratio * (points.length - 1))));
    setActive({ index, x: event.clientX, y: box.top });
  }

  const flip = active && typeof window !== 'undefined' ? active.x > window.innerWidth - 180 : false;

  return (
    <span className={`relative block ${className}`}>
      {/* No width/height ATTRIBUTE - the caller sizes it with a class and the
          viewBox scales to fit. An SVG carrying width={72} stays 72px however
          narrow its container gets, which is exactly how this pushed out
          through the card's right edge before. */}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="block h-full w-full"
        aria-hidden="true"
        focusable="false"
        onPointerMove={hoverable ? onMove : undefined}
        onPointerLeave={hoverable ? () => setActive(null) : undefined}
        style={hoverable ? { cursor: 'crosshair', touchAction: 'none' } : undefined}
      >
        <path d={area} fill="currentColor" opacity="0.14" />
        <path
          d={line}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {active ? (
          <>
            <line
              x1={active.index * step}
              x2={active.index * step}
              y1="0"
              y2={height}
              stroke="currentColor"
              strokeWidth="1"
              opacity="0.35"
              vectorEffect="non-scaling-stroke"
            />
            {/* A <circle> would be squashed to an ellipse by
                preserveAspectRatio="none". A zero-length round-capped line
                keeps its shape, because a stroke is not scaled with the box. */}
            <line
              x1={active.index * step}
              x2={active.index * step}
              y1={y(points[active.index])}
              y2={y(points[active.index])}
              stroke="currentColor"
              strokeWidth="6"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </>
        ) : null}
      </svg>

      {active && tips[active.index] ? (
        <span
          className="pointer-events-none fixed z-50 -translate-y-full rounded-lg bg-ink-900 px-2.5 py-1.5 text-xs shadow-lg"
          style={{
            left: flip ? undefined : active.x + 12,
            right: flip ? window.innerWidth - active.x + 12 : undefined,
            top: active.y - 6,
          }}
        >
          <span className="tabular block whitespace-nowrap font-bold text-white">
            {tips[active.index].v}
          </span>
          <span className="block whitespace-nowrap font-medium text-ink-300">
            {tips[active.index].d}
          </span>
        </span>
      ) : null}
    </span>
  );
}
