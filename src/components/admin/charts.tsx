'use client';

import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatCompactCurrency, formatCurrency } from '@/lib/utils';
import type { CategoryDistributionRow, RevenueSeriesRow } from '@/types/database';

/**
 * Dashboard charts.
 *
 * Colour comes from the validated `.viz-root` roles in globals.css, never from
 * the brand tokens — a bar and a button should not share a hue. Marks follow
 * the house specs: 2px lines, bars capped at 24px with a 4px rounded cap and a
 * 2px gap between neighbours, hairline recessive gridlines, and text in text
 * tokens rather than the series colour.
 */

const AXIS_TICK = { fontSize: 11, fill: 'var(--color-muted-foreground)' };
const GRID_STROKE = 'var(--viz-grid)';

interface TooltipRow {
  name?: string;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
}

function ChartTooltip({
  active,
  payload,
  label,
  formatter,
}: {
  active?: boolean;
  payload?: TooltipRow[];
  label?: string;
  formatter?: (value: number) => string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="bg-popover text-popover-foreground rounded-lg border px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold">{label}</p>
      <ul className="space-y-0.5">
        {payload.map((row) => (
          <li key={String(row.dataKey)} className="flex items-center gap-2">
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: row.color }}
            />
            <span className="text-muted-foreground">{row.name}</span>
            <span className="tnum ml-auto font-semibold">
              {formatter ? formatter(Number(row.value ?? 0)) : String(row.value ?? '')}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Legend rendered as HTML rather than an SVG legend, so the text uses text tokens. */
function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="text-muted-foreground mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: item.color }} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * Monthly revenue. One series, so no legend box — the card title says what it
 * is. The line carries a 10%-opacity wash beneath it and an end marker.
 */
export function RevenueChart({ data }: { data: RevenueSeriesRow[] }) {
  const rows = data.map((row) => ({ ...row, revenue: Number(row.revenue) }));

  return (
    <div className="viz-root">
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          <defs>
            <linearGradient id="revenueWash" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--series-1)" stopOpacity={0.16} />
              <stop offset="100%" stopColor="var(--series-1)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID_STROKE} strokeWidth={1} vertical={false} />
          <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} />
          <YAxis
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={56}
            tickFormatter={(value: number) => formatCompactCurrency(value)}
          />
          <Tooltip
            cursor={{ stroke: GRID_STROKE, strokeWidth: 1 }}
            content={<ChartTooltip formatter={(value) => formatCurrency(value)} />}
          />
          <Area type="monotone" dataKey="revenue" name="Revenue" stroke="none" fill="url(#revenueWash)" />
          <Line
            type="monotone"
            dataKey="revenue"
            name="Revenue"
            stroke="var(--series-1)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={false}
            activeDot={{ r: 5, fill: 'var(--series-1)', stroke: 'var(--surface-1)', strokeWidth: 2 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Cash versus online collections. Grouped rather than stacked so the 2px gap between neighbours does the separating. */
export function PaymentMethodChart({ data }: { data: RevenueSeriesRow[] }) {
  const rows = data.map((row) => ({
    label: row.label,
    cash: Number(row.cash_revenue),
    online: Number(row.online_revenue),
  }));

  return (
    <div className="viz-root">
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -12 }} barGap={2} barCategoryGap="28%">
          <CartesianGrid stroke={GRID_STROKE} strokeWidth={1} vertical={false} />
          <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} />
          <YAxis
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={56}
            tickFormatter={(value: number) => formatCompactCurrency(value)}
          />
          <Tooltip
            cursor={{ fill: GRID_STROKE, fillOpacity: 0.35 }}
            content={<ChartTooltip formatter={(value) => formatCurrency(value)} />}
          />
          <Bar dataKey="cash" name="Cash / desk" fill="var(--series-1)" maxBarSize={24} radius={[4, 4, 0, 0]} />
          <Bar dataKey="online" name="Online" fill="var(--series-2)" maxBarSize={24} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <Legend
        items={[
          { label: 'Cash / desk', color: 'var(--series-1)' },
          { label: 'Online', color: 'var(--series-2)' },
        ]}
      />
    </div>
  );
}

/** New joins versus renewals per month. */
export function MembershipMixChart({ data }: { data: RevenueSeriesRow[] }) {
  const rows = data.map((row) => ({
    label: row.label,
    joined: Number(row.new_memberships),
    renewed: Number(row.renewals),
  }));

  return (
    <div className="viz-root">
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -20 }} barGap={2} barCategoryGap="28%">
          <CartesianGrid stroke={GRID_STROKE} strokeWidth={1} vertical={false} />
          <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} />
          <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={40} allowDecimals={false} />
          <Tooltip cursor={{ fill: GRID_STROKE, fillOpacity: 0.35 }} content={<ChartTooltip />} />
          <Bar dataKey="joined" name="New members" fill="var(--series-1)" maxBarSize={24} radius={[4, 4, 0, 0]} />
          <Bar dataKey="renewed" name="Renewals" fill="var(--series-2)" maxBarSize={24} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <Legend
        items={[
          { label: 'New members', color: 'var(--series-1)' },
          { label: 'Renewals', color: 'var(--series-2)' },
        ]}
      />
    </div>
  );
}

/**
 * Category mix.
 *
 * A part-to-whole of two or three categories: a horizontal stacked bar, not a
 * donut. Plain HTML, so the 2px separator really is a gap in the surface, and
 * every value is directly labelled — which is also the relief the light-mode
 * contrast warning on aqua requires.
 */
export function CategoryMix({ data }: { data: CategoryDistributionRow[] }) {
  const total = data.reduce((sum, row) => sum + Number(row.member_count), 0);
  if (total === 0) {
    return <p className="text-muted-foreground py-6 text-center text-sm">No active memberships to break down yet.</p>;
  }

  const colours = ['var(--series-1)', 'var(--series-2)', 'var(--color-muted-foreground)'];
  const rows = data.slice(0, 3).map((row, index) => ({
    name: row.category_name,
    count: Number(row.member_count),
    share: (Number(row.member_count) / total) * 100,
    colour: colours[index] ?? colours[2]!,
  }));

  return (
    <div className="viz-root space-y-3">
      <div className="flex h-6 w-full gap-0.5 overflow-hidden rounded-md" role="img" aria-label="Members by category">
        {rows.map((row) => (
          <div
            key={row.name}
            style={{ width: `${row.share}%`, backgroundColor: row.colour }}
            className="first:rounded-l-md last:rounded-r-md"
          />
        ))}
      </div>

      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.name} className="flex items-center gap-2 text-sm">
            <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: row.colour }} />
            <span className="min-w-0 flex-1 truncate">{row.name}</span>
            <span className="tnum text-muted-foreground">{row.share.toFixed(0)}%</span>
            <span className="tnum w-10 text-right font-semibold">{row.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
