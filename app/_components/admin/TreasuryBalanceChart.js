'use client';

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import {
  AXIS,
  CURSOR,
  ChartHeader,
  EmptyChart,
  GRID,
  TICK,
  Tip,
  tickDay,
} from '@/app/_components/admin/dashboard/TrendCharts';
import { formatPKR } from '@/app/_lib/format-helpers';

/**
 * What went into the safe each day, what came out, and what it was left
 * holding.
 *
 * WHY ALL THREE ON ONE CHART. The safe's balance on its own is a line that
 * falls off a cliff and climbs back, and it never says why. The movements on
 * their own say why and never say whether the safe was nearly empty at the
 * time. On the owner's first eight days both matter at once: Rs 1.85m in the
 * safe on the 17th, an Rs 1.59m payment out the same day, Rs 187,920 left.
 * Read off two charts that is arithmetic; read off one it is a picture.
 *
 * THE BARS ARE MOVEMENTS AND THE LINE IS A LEVEL, and they are coloured to
 * say so. The two bars take the app's validated two-series pair - green and
 * violet, checked with the palette validator rather than picked by eye,
 * because green/amber does not separate for red-green colour blindness (see
 * CashCreditChart, which uses the same pair for the same reason). The balance
 * line is deliberately NOT a third hue: it is slate, the app's neutral, so it
 * reads as the thing the two coloured series add up to rather than as a third
 * kind of movement. That also keeps the chart to two decorative hues, which
 * is what "Two palettes, and they never overlap" in docs/UI_CONVENTIONS.md
 * asks of anything sharing a page with the fuels' own colours.
 *
 * ONE Y AXIS, because both are rupees. Two axes would let a small movement be
 * drawn taller than a large balance, which is the standard way a combined
 * chart lies.
 *
 * Everything on it is formatted here in the browser with Intl rather than by
 * helpers.js - that module reads request cookies and cannot enter a client
 * bundle. The pre-formatted-on-the-server rule applies to Sparkline's `tips`,
 * where the caller knows the unit and the component cannot; here the unit is
 * always rupees and always this component's own.
 */
const IN_COLOR = '#047857';
const OUT_COLOR = '#7c3aed';
const BALANCE_COLOR = '#334155';
const SURFACE = '#ffffff';

const compact = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

/*
 * IN THE NEW LOOK'S CHART FRAME (dashboard/TrendCharts.js), shared rather than
 * copied: 12px ink-600 axis text (it was 11px in ink-500, under both floors),
 * days as "26 Sep" (it was "26/09", which a day-first reader and an en-US
 * browser read differently), the legend in words above the plot, and a
 * tooltip that names the weekday. What it draws is unchanged.
 */
const LEGEND = [
  { color: IN_COLOR, label: 'Cash in' },
  { color: OUT_COLOR, label: 'Cash out' },
  { color: BALANCE_COLOR, label: 'In the safe at close' },
];

export default function TreasuryBalanceChart({ daily, height = 300 }) {
  const points = (daily ?? []).map((row) => ({
    day: row.day,
    cashIn: Number(row.cash_in ?? 0),
    cashOut: Number(row.cash_out ?? 0),
    closing: Number(row.closing ?? 0),
  }));

  return (
    <>
      <ChartHeader title="The safe, day by day" legend={LEGEND} />
      {points.length < 2 ? (
        <EmptyChart height={height}>Not enough days recorded yet to draw a trend.</EmptyChart>
      ) : (
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={points} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="4 4" />
              <XAxis
                dataKey="day"
                tickFormatter={tickDay}
                tick={TICK}
                tickLine={false}
                axisLine={{ stroke: AXIS }}
                interval="preserveStartEnd"
                minTickGap={20}
                tickMargin={8}
              />
              <YAxis
                tick={TICK}
                tickLine={false}
                axisLine={false}
                width={52}
                tickFormatter={(value) => compact.format(value)}
              />
              {/* No total row: a day's cash in, cash out and closing balance do
                  not add up to anything. */}
              <Tooltip cursor={{ fill: CURSOR }} content={<Tip format={formatPKR} />} />
              <Bar
                dataKey="cashIn"
                name="Cash in"
                fill={IN_COLOR}
                stroke={SURFACE}
                strokeWidth={2}
                radius={[4, 4, 0, 0]}
                maxBarSize={22}
              />
              <Bar
                dataKey="cashOut"
                name="Cash out"
                fill={OUT_COLOR}
                stroke={SURFACE}
                strokeWidth={2}
                radius={[4, 4, 0, 0]}
                maxBarSize={22}
              />
              {/* Drawn last so it sits over the bars, and given a white halo by
                  the dot's own stroke - a 2px dark line crossing a violet bar is
                  otherwise hard to follow at tablet brightness. */}
              <Line
                type="monotone"
                dataKey="closing"
                name="In the safe at close"
                stroke={BALANCE_COLOR}
                strokeWidth={2.5}
                dot={{ r: 3, fill: BALANCE_COLOR, stroke: SURFACE, strokeWidth: 1.5 }}
                activeDot={{ r: 5 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </>
  );
}
