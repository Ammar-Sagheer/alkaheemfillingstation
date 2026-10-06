'use client';

import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { FUEL_COLORS, fuelColor } from '@/app/_lib/fuel-colors';
import { formatLitres, formatPKR, sumMoney } from '@/app/_lib/format-helpers';
import { formatDate, formatDateLong } from '@/app/_lib/date-helpers';

/**
 * The Dashboard's three trend charts, in the new look.
 *
 * SAME SERIES, SAME COLOURS, SAME REASONS as the old three (SalesTrendChart,
 * CashCreditChart, LubricantTrendChart), now deleted, whose reasoning is in
 * git history and docs/CHANGELOG.md - the rupees/litres toggle exists because in rupees
 * the sales chart and the cash-vs-credit chart drew the same picture; credit is
 * violet because green/violet survives red-green colour blindness where
 * green/amber does not; the oil chart is two golds separated by lightness,
 * because packed and loose are two halves of one product. None of that is
 * re-decided here. What changed is how they are drawn:
 *
 *   - AXIS TEXT AT 12px ink-600, not 11px ink-500. The old ticks were under the
 *     app's own caption floor and below its contrast floor for anything meant
 *     to be read.
 *   - DAYS AS "26 Sep", not "26/09". A day-and-month in digits is the format a
 *     day-first reader and an en-US browser disagree about; a month name cannot
 *     be misread.
 *   - THE LEGEND IS WORDS IN THE HEADER, not Recharts' own strip squeezed above
 *     the plot at 12px in whatever order it chose - each series as a swatch and
 *     its name, in the order the bars stack, read top to bottom.
 *   - THE TOOLTIP NAMES THE WEEKDAY ("Saturday, 26 Sep 2026") and, on a stacked
 *     chart, the day's total - the database's own figure for that day wherever
 *     its RPC returns one (litres sold, the sale amount). The oil RPC has no
 *     total column, so there the two figures are added, in paisa, by sumMoney.
 *   - Figures in the tooltip are written by format-helpers.js - formatPKR,
 *     formatLitres - the same functions every table uses, rather than a
 *     chart-local Intl formatter that could drift from them.
 *
 * On rollout, Reports moves to these and the old three are deleted.
 */

export const TICK = { fontSize: 12, fill: '#475569' };
export const GRID = '#e2e8f0';
export const AXIS = '#cbd5e1';
const SURFACE = '#ffffff';
export const CURSOR = 'rgb(15 23 42 / 0.05)';

const SALE_COLOR = '#047857';
const CASH_COLOR = '#047857';
const CREDIT_COLOR = '#7c3aed';
const PETROL_COLOR = FUEL_COLORS.petrol.hex;
const DIESEL_COLOR = FUEL_COLORS.diesel.hex;
const PACK_COLOR = fuelColor('lubricant').deepHex;
const LOOSE_COLOR = fuelColor('lubricant').raw;

const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

/** "2026-09-26" -> "26 Sep". */
export const tickDay = (day) => formatDate(day).slice(0, 6);

/* ---------------------------------------------------------------------------
   Daily fuel sales, in rupees or litres
--------------------------------------------------------------------------- */

export function FuelSalesChart({ data, height = 260 }) {
  const [mode, setMode] = useState('money');
  const showingLitres = mode === 'litres';

  const points = data.map((row) => ({
    day: row.day,
    sale: Number(row.sale_amount ?? 0),
    petrol: Number(row.petrol_litres ?? 0),
    diesel: Number(row.diesel_litres ?? 0),
    // The database's own total for the day, for the tooltip.
    litres: Number(row.litres_sold ?? 0),
  }));

  /* Emptiness is judged on the series being SHOWN - asking the other one could
     put "no sales" over a chart that has bars in the mode on screen. */
  const empty = showingLitres
    ? points.every((point) => point.petrol === 0 && point.diesel === 0)
    : points.every((point) => point.sale === 0);

  const legend = showingLitres
    ? [
        { color: DIESEL_COLOR, label: 'Diesel' },
        { color: PETROL_COLOR, label: 'Petrol' },
      ]
    : [{ color: SALE_COLOR, label: 'Fuel sales' }];

  return (
    <>
      <ChartHeader title="Daily fuel sales" legend={legend}>
        <ModeToggle mode={mode} onChange={setMode} />
      </ChartHeader>

      {points.length === 0 || empty ? (
        <EmptyChart height={height}>No sales recorded in this period yet.</EmptyChart>
      ) : (
        <Plot data={points} height={height} yUnit={showingLitres ? 'litres' : 'money'}>
          <Tooltip
            cursor={{ fill: CURSOR }}
            content={
              <Tip
                format={showingLitres ? formatLitres : formatPKR}
                total={showingLitres ? (point) => point.litres : null}
              />
            }
          />
          {showingLitres ? (
            [
              /* Petrol at the foot of the bar and diesel on top, so the
                 legend - Diesel, then Petrol - reads in the order the stack
                 does. Only the top segment is rounded, or the lower one's
                 corners notch into it. */
              <Bar
                key="petrol"
                dataKey="petrol"
                name="Petrol"
                stackId="litres"
                fill={PETROL_COLOR}
                stroke={SURFACE}
                strokeWidth={2}
                maxBarSize={30}
              />,
              <Bar
                key="diesel"
                dataKey="diesel"
                name="Diesel"
                stackId="litres"
                fill={DIESEL_COLOR}
                stroke={SURFACE}
                strokeWidth={2}
                radius={[6, 6, 0, 0]}
                maxBarSize={30}
              />,
            ]
          ) : (
            <Bar dataKey="sale" name="Fuel sales" fill={SALE_COLOR} radius={[6, 6, 0, 0]} maxBarSize={30} />
          )}
        </Plot>
      )}
    </>
  );
}

/* ---------------------------------------------------------------------------
   Fuel: cash against credit
--------------------------------------------------------------------------- */

export function CashAgainstCreditChart({ data, height = 260 }) {
  const points = data.map((row) => ({
    day: row.day,
    cash: Number(row.cash_amount ?? 0),
    credit: Number(row.credit_amount ?? 0),
    // The database's own sale figure for the day - cash plus credit, which a
    // constraint guarantees, but read rather than re-added.
    total: Number(row.sale_amount ?? 0),
  }));

  const empty = points.every((point) => point.cash === 0 && point.credit === 0);

  return (
    <>
      <ChartHeader
        title="Fuel: cash against credit"
        legend={[
          { color: CREDIT_COLOR, label: 'Credit' },
          { color: CASH_COLOR, label: 'Cash' },
        ]}
      />

      {points.length === 0 || empty ? (
        <EmptyChart height={height}>No sales recorded in this period yet.</EmptyChart>
      ) : (
        <Plot data={points} height={height} yUnit="money">
          <Tooltip
            cursor={{ fill: CURSOR }}
            content={<Tip format={formatPKR} total={(point) => point.total} />}
          />
          <Bar
            dataKey="cash"
            name="Cash"
            stackId="takings"
            fill={CASH_COLOR}
            stroke={SURFACE}
            strokeWidth={2}
            maxBarSize={30}
          />
          <Bar
            dataKey="credit"
            name="Credit"
            stackId="takings"
            fill={CREDIT_COLOR}
            stroke={SURFACE}
            strokeWidth={2}
            radius={[6, 6, 0, 0]}
            maxBarSize={30}
          />
        </Plot>
      )}
    </>
  );
}

/* ---------------------------------------------------------------------------
   Oil: packed and loose
--------------------------------------------------------------------------- */

export function OilSalesChart({ data, height = 260 }) {
  const points = data.map((row) => ({
    day: row.day,
    pack: Number(row.pack_amount ?? 0),
    loose: Number(row.loose_amount ?? 0),
    // This RPC carries no total column, so the day's two figures are added -
    // in paisa, exactly, which is what sumMoney is for.
    total: sumMoney([row.pack_amount, row.loose_amount]),
  }));

  const empty = points.every((point) => point.pack === 0 && point.loose === 0);

  return (
    <>
      <ChartHeader
        title="Oil sales, packed and loose"
        legend={[
          { color: LOOSE_COLOR, label: 'Loose oil' },
          { color: PACK_COLOR, label: 'Packed' },
        ]}
      />

      {points.length === 0 || empty ? (
        <EmptyChart height={height}>No oil sold in this period yet.</EmptyChart>
      ) : (
        <Plot data={points} height={height} yUnit="money">
          <Tooltip
            cursor={{ fill: CURSOR }}
            content={<Tip format={formatPKR} total={(point) => point.total} />}
          />
          <Bar
            dataKey="pack"
            name="Packed"
            stackId="oil"
            fill={PACK_COLOR}
            stroke={SURFACE}
            strokeWidth={2}
            maxBarSize={30}
          />
          <Bar
            dataKey="loose"
            name="Loose oil"
            stackId="oil"
            fill={LOOSE_COLOR}
            stroke={SURFACE}
            strokeWidth={2}
            radius={[6, 6, 0, 0]}
            maxBarSize={30}
          />
        </Plot>
      )}
    </>
  );
}

/* ---------------------------------------------------------------------------
   Shared pieces
--------------------------------------------------------------------------- */

/** The axes, grid and container every chart here shares. */
function Plot({ data, height, yUnit, children }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
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
            width={yUnit === 'litres' ? 44 : 52}
            tickFormatter={(value) => compact.format(value)}
          />
          {children}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ChartHeader({ title, legend, children }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h3 className="text-lg font-bold text-ink-900">{title}</h3>
        {/* Colour is never the only cue: every series is named here in words,
            beside its swatch. */}
        <ul className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
          {legend.map((item) => (
            <li key={item.label} className="flex items-center gap-2 text-sm font-medium text-ink-700">
              <span
                aria-hidden="true"
                className="h-3 w-3 shrink-0 rounded-[4px] ring-1 ring-inset ring-black/10"
                style={{ backgroundColor: item.color }}
              />
              {item.label}
            </li>
          ))}
        </ul>
      </div>
      {children}
    </div>
  );
}

/**
 * Rupees or litres. Client state, not a query string: both views come out of
 * rows the page already holds, so a round trip would be a spinner in exchange
 * for nothing. `aria-pressed` says which is on; the fill is the second cue.
 */
function ModeToggle({ mode, onChange }) {
  const options = [
    ['money', 'Rupees'],
    ['litres', 'Litres'],
  ];

  return (
    <div role="group" aria-label="Show the trend in rupees or litres" className="seg">
      {options.map(([value, label]) => (
        <button
          key={value}
          type="button"
          aria-pressed={mode === value}
          onClick={() => onChange(value)}
          className={mode === value ? 'seg-item-active' : 'seg-item'}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * The hover readout. The day is written in full, weekday first, because a bar
 * is picked out by position and "Saturday" is what the reader can check it
 * against. Each series has its swatch beside its name; the names stay in ink,
 * since coloured text would make the series depend on colour alone and the
 * pale gold would not be legible as text anyway.
 */
export function Tip({ active, payload, format, total }) {
  if (!active || !payload?.length) return null;

  const point = payload[0].payload;
  const rows = [...payload].reverse(); // top of the stack first, like the legend

  return (
    <div className="min-w-[13rem] rounded-2xl border border-ink-200 bg-white px-4 py-3 shadow-lg">
      <p className="mb-2 text-sm font-semibold text-ink-900">{formatDateLong(point.day)}</p>
      <ul className="space-y-1.5">
        {rows.map((item) => (
          <li key={item.dataKey} className="flex items-center gap-2 text-sm">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 rounded-sm ring-1 ring-inset ring-black/10"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-ink-700">{item.name}</span>
            <span className="tabular ml-auto whitespace-nowrap pl-4 font-semibold text-ink-900">
              {format(item.value)}
            </span>
          </li>
        ))}
      </ul>
      {total && rows.length > 1 ? (
        <p className="mt-2 flex items-center justify-between gap-4 border-t border-ink-200 pt-2 text-sm">
          <span className="font-medium text-ink-700">Total</span>
          <span className="tabular whitespace-nowrap font-bold text-ink-900">{format(total(point))}</span>
        </p>
      ) : null}
    </div>
  );
}

export function EmptyChart({ height, children }) {
  return (
    <p
      className="flex items-center justify-center rounded-2xl bg-ink-50 px-4 text-center text-base text-ink-600 ring-1 ring-inset ring-ink-200/70"
      style={{ height }}
    >
      {children}
    </p>
  );
}
