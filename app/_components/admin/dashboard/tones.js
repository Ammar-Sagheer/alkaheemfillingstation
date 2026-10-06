import { fuelColor } from '@/app/_lib/fuel-colors';

/**
 * The new look's meaning colours, in one place: what an icon tile and a
 * sparkline wear for each KIND of figure.
 *
 * The same vocabulary the old stat tiles use (AdminStats.js -> ACCENT_COLORS),
 * with ONE deliberate change: credit is VIOLET here, not amber.
 *
 * WHY. The dashboard already drew credit in violet - `CashCreditChart` pairs
 * green cash with violet credit because that pair was chosen with a palette
 * validator and survives red-green colour blindness, where green/amber does not
 * (deutan dE 25.2; see that file). The stat tile above it said "credit" in
 * amber, so the same figure wore two colours on one page. And amber is the one
 * chrome hue a fuel owns: diesel's orange sits six degrees from amber-600, which
 * is why the old tiles had to keep amber off every sparkline and every filled
 * ring. Violet belongs to no fuel, so credit can have a real tile and a real
 * line without spending diesel's colour. On the new dashboard, green is cash and
 * violet is credit everywhere they appear - tile, line and chart.
 *
 * Amber is still the colour of a warning about money or a day (a future date);
 * it simply no longer names a kind of figure here.
 *
 *   money   takings arriving - total sales, cash         brand green
 *   credit  takings owed to the pump                      violet
 *   held    things the pump HOLDS - fuel, tanks           teal
 *   oil     the lubricant section                         lubricant's own gold
 *   neutral anything that is neither - trends, deliveries slate
 *   alert   something to look at                          red
 *
 * TEAL NEVER GETS AN AREA. On a 40px tile with a 700 glyph it reads as "teal";
 * as a filled sparkline sitting over the petrol card it drifts toward blue, which
 * is petrol's. So `held` draws its line in slate - the old tiles' rule that the
 * test is AREA, not size, kept as it was.
 */
export const TILE = {
  money: 'bg-brand-100 text-brand-700',
  credit: 'bg-violet-100 text-violet-700',
  held: 'bg-teal-100 text-teal-700',
  // Lubricant's `soft` pair - the pale ground and the dark glyph together,
  // which is exactly what a tile wants. Read from fuel-colors.js rather than
  // retyped: a product's colour is decided in that one file.
  oil: fuelColor('lubricant').soft,
  // ink-200, not the ink-100 the other grounds' "100" would suggest: ink-100
  // IS the page background, so a section header's tile - which sits on the
  // page, not on a panel - vanished into it at the first render.
  neutral: 'bg-ink-200 text-ink-800',
  alert: 'bg-red-100 text-red-700',
};

/*
 * The wash behind an undated page's title (`TitleHeader`): the tone's palest
 * shade in the top-left corner, gone to white by the middle - the tile's colour
 * spread thin, so the page has a colour without a second thing to read.
 *
 * NOT the slate wash `DayHeader` gives a past day. On a dated page slate means
 * "you are not on today"; a page with no date must not borrow that signal.
 * Neutral is therefore the faintest slate there is, barely off white.
 */
export const WASH = {
  money: 'linear-gradient(115deg, #ecfdf5 0%, #ffffff 55%)',
  credit: 'linear-gradient(115deg, #f5f3ff 0%, #ffffff 55%)',
  held: 'linear-gradient(115deg, #f0fdfa 0%, #ffffff 55%)',
  oil: 'linear-gradient(115deg, #f9f5e7 0%, #ffffff 55%)',
  neutral: 'linear-gradient(115deg, #f8fafc 0%, #ffffff 55%)',
  alert: 'linear-gradient(115deg, #fef2f2 0%, #ffffff 55%)',
};

export const LINE = {
  money: 'text-brand-600',
  credit: 'text-violet-600',
  held: 'text-ink-500',
  oil: 'text-ink-500',
  neutral: 'text-ink-500',
  alert: 'text-red-600',
};
