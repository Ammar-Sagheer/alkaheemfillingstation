import { fuelColor, FUEL_COLORS } from '@/app/_lib/fuel-colors';

/**
 * Petrol, diesel and lubricant keep the same colours everywhere in the app - on
 * the nozzles of the reading sheet, in badges, in table rows, on the dashboard
 * cards and in the charts - so the fuel can be recognised without reading the
 * label. The colours themselves live in `app/_lib/fuel-colors.js`; this is only
 * the chip that wears them.
 *
 * The chips are SOLID, not the pale tints they used to be. Two pale chips - one
 * faintly blue, one faintly amber - are the same chip to anyone glancing at a
 * row of nozzles on a tablet in poor light, which is the moment this badge
 * exists for. They differ in LIGHTNESS first and hue second, so they stay
 * apart under any conditions. See the long note in fuel-colors.js for how
 * that lesson was learned.
 *
 * This reads `color.badge`, NOT `color.solid`. A badge is a small pill with
 * bold small text, read at a glance down a column of nozzles - a harder job
 * than the big card bands `solid` was tuned for, where a lot of surface makes
 * middling contrast forgivable.
 *
 * Petrol's chip is DARK BLUE WITH WHITE TEXT and diesel's is LIGHT ORANGE
 * WITH DARK TEXT, which is three cues apart rather than one: opposite hue,
 * opposite weight, and opposite letter colour. That last one is what still
 * works when the screen is failing or the light is bad, and it is the reason
 * the two are not simply the same treatment in two hues. Lubricant's chip is
 * the dark relative of its gold behind white text (7.6:1) - the raw gold
 * behind dark text passes AA but reads as "hard to see" at this size.
 *
 * The word is always there beside the colour. This badge is never the only
 * thing saying which fuel something is.
 */
export default function FuelBadge({ fuelType }) {
  if (!fuelType) return null;

  const color = fuelColor(fuelType);
  const label = FUEL_COLORS[fuelType]?.label ?? fuelType;

  return <span className={`badge ${color.badge}`}>{label}</span>;
}
