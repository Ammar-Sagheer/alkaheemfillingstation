import { fuelColor } from '@/app/_lib/fuel-colors';

/*
 * A low, wide sheen across the liquid so it reads as the side of a cylinder
 * rather than a flat block of colour - the "3D" the owner keeps asking for,
 * done the way `.fuel-band` does it: white and black at low alpha, measured
 * across the whole shape, so it adds depth and NO colour. The fuel's hue is
 * still decided by fuel-colors.js alone.
 */
const CYLINDER =
  'linear-gradient(90deg, rgb(255 255 255 / 0.28) 0%, rgb(255 255 255 / 0.06) 38%, rgb(0 0 0 / 0) 62%, rgb(0 0 0 / 0.12) 100%)';

/**
 * How full a tank is, drawn as a tank.
 *
 * The old card had a 10px progress bar under the figure. This is the same
 * number as a shape: an upright tank with the fuel standing in it, quarter
 * marks up the side, filled in the fuel's own BAND colour - dark blue for
 * petrol, light orange for diesel - so the two tanks differ in lightness as
 * well as hue, which is the separation fuel-colors.js exists to protect. The
 * light fill gets its surface drawn as a line in the fuel's darker relative,
 * because #FDBA74 against the pale track is nearly invisible as an edge.
 *
 * DECORATION WITH A SHAPE, NEVER THE ONLY STATEMENT. The litres, the percent
 * and the capacity are all written out beside it by the caller; the gauge has
 * no numbers of its own and says the percentage to a screen reader.
 *
 * `percent` is clamped to 0-100 here, so a book stock below zero draws an empty
 * tank (the caller says why in words) and one over capacity draws a full one.
 */
export default function TankGauge({ fuelType, percent, label }) {
  const color = fuelColor(fuelType);
  const fill = Math.min(100, Math.max(0, Number(percent) || 0));

  return (
    <div
      role="img"
      aria-label={label}
      className="relative h-32 w-[4.5rem] shrink-0 overflow-hidden rounded-[1.25rem] border-2 border-ink-300 bg-ink-100"
      style={{ backgroundImage: CYLINDER }}
    >
      {fill > 0 ? (
        <div
          className={`absolute inset-x-0 bottom-0 border-t-2 ${color.solid} ${color.border}`}
          style={{ height: `${fill}%`, backgroundImage: CYLINDER }}
        />
      ) : null}

      {/* Quarter marks, over the fuel as well as the air, on the left wall -
          the level is read against them the way a dipstick is read. */}
      {[25, 50, 75].map((mark) => (
        <span
          key={mark}
          aria-hidden="true"
          className="absolute left-0 h-0.5 w-3 rounded-r-full bg-ink-900/25"
          style={{ bottom: `calc(${mark}% - 1px)` }}
        />
      ))}
    </div>
  );
}
