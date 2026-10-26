// app/analytics/_components/viz/TimeSeriesChart.tsx

'use client';

import { useState } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts';

import { formatBucket, formatTick, pickTicks, type BucketRange, type Granularity } from './time-buckets';

import { cn } from '@/shared/utils';


// ============================================================================
// TYPES
// ============================================================================

export interface TimeSeries {
  key: string;
  label: string;
  /** A viz token, e.g. 'var(--viz-1)' */
  color: string;
}

interface TimeSeriesChartProps {
  /** One row per bucket: { t: bucket start (ms), [series.key]: value } */
  data: Array<{ t: number } & Record<string, number>>;
  series: TimeSeries[];
  granularity: Granularity;
  formatValue: (value: number) => string;
  /** Short description for screen readers */
  ariaLabel: string;
  height?: number;
  /** Fix the y-axis top, e.g. 1 for rates */
  yMax?: number;
  /** Rates and averages need fractional ticks; counts don't */
  allowDecimals?: boolean;
  /** Buckets picked on the chart, highlighted. Charts sharing a time axis can share one selection. */
  selection?: BucketRange | null;
  /** Makes the chart pickable: click a bucket or drag across several */
  onSelect?: (range: BucketRange) => void;
}

const AXIS_TICK = { fontSize: 11, fill: 'var(--muted-foreground)' };

/** The x value under the pointer, from a Recharts chart mouse event */
function bucketAt(state: unknown): number | null {
  const label = (state as { activeLabel?: unknown } | null)?.activeLabel;
  return typeof label === 'number' ? label : null;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function TimeSeriesChart({
  data,
  series,
  granularity,
  formatValue,
  ariaLabel,
  height = 220,
  yMax,
  allowDecimals = false,
  selection,
  onSelect,
}: TimeSeriesChartProps) {
  const single = series.length === 1;
  // Few points (a week by day): mark each one, so the line reads as measurements, not a curve
  const showDots = data.length <= 31;
  const ticks = pickTicks(data.map((d) => d.t), granularity);
  const allZero = data.every((d) => series.every((s) => !d[s.key]));
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [drag, setDrag] = useState<{ start: number; end: number } | null>(null);

  const toggleSeries = (key: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      // Keep at least one series on screen
      else if (series.length - next.size > 1) next.add(key);
      return next;
    });

  const finishDrag = () => {
    if (!drag) return;
    setDrag(null);
    onSelect?.({ from: Math.min(drag.start, drag.end), to: Math.max(drag.start, drag.end) });
  };

  // Highlight half a bucket either side of the picked bucket starts, so a single bucket shows as a band
  const halfBucket = data.length > 1 ? (data[1].t - data[0].t) / 2 : 0;
  const band = drag ? { from: Math.min(drag.start, drag.end), to: Math.max(drag.start, drag.end) } : selection;

  return (
    <div className="space-y-3">
      {!single && (
        <ul className="flex flex-wrap gap-x-1 gap-y-1 text-xs text-muted-foreground" aria-label="Legend">
          {series.map((s) => {
            const off = hidden.has(s.key);
            return (
              <li key={s.key}>
                <button
                  type="button"
                  onClick={() => toggleSeries(s.key)}
                  aria-pressed={!off}
                  title={off ? `Show ${s.label}` : `Hide ${s.label}`}
                  className={cn(
                    'flex items-center gap-1.5 rounded px-1.5 py-0.5 transition-colors hover:bg-muted hover:text-foreground',
                    off && 'opacity-50 line-through',
                  )}
                >
                  <span className="h-0.5 w-3 rounded-full" style={{ background: s.color }} aria-hidden />
                  {s.label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div
        style={{ height }}
        role="img"
        aria-label={onSelect ? `${ariaLabel}. Click a point or drag across a range to look closer.` : ariaLabel}
        className={cn(onSelect && 'cursor-pointer select-none')}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
            onMouseDown={
              onSelect
                ? (state) => {
                    const t = bucketAt(state);
                    if (t !== null) setDrag({ start: t, end: t });
                  }
                : undefined
            }
            onMouseMove={
              onSelect && drag
                ? (state) => {
                    const t = bucketAt(state);
                    if (t !== null && t !== drag.end) setDrag({ ...drag, end: t });
                  }
                : undefined
            }
            onMouseUp={onSelect ? finishDrag : undefined}
            onMouseLeave={onSelect ? finishDrag : undefined}
          >
            <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              ticks={ticks}
              tickFormatter={(t: number) => formatTick(t, granularity, data.length)}
              minTickGap={28}
              axisLine={{ stroke: 'var(--viz-axis)' }}
              tickLine={false}
              tick={AXIS_TICK}
              dy={6}
            />
            <YAxis
              width={44}
              // All zeros: give the axis a top of 1 rather than letting it invent a scale (0–300%)
              domain={[0, yMax ?? (allZero ? 1 : 'auto')]}
              ticks={allZero && yMax === undefined ? [0, 1] : undefined}
              allowDecimals={allowDecimals}
              tickFormatter={formatValue}
              axisLine={false}
              tickLine={false}
              tick={AXIS_TICK}
              tickCount={4}
            />
            {band && (
              <ReferenceArea
                x1={band.from - halfBucket}
                x2={band.to + halfBucket}
                ifOverflow="hidden"
                fill="var(--viz-axis)"
                fillOpacity={0.3}
                stroke="none"
              />
            )}
            <Tooltip
              cursor={{ stroke: 'var(--viz-axis)', strokeWidth: 1 }}
              content={<SeriesTooltip series={series} hidden={hidden} granularity={granularity} formatValue={formatValue} />}
              isAnimationActive={false}
            />
            {single && (
              <Area
                dataKey={series[0].key}
                type="linear"
                stroke="none"
                fill={series[0].color}
                fillOpacity={0.1}
                isAnimationActive={false}
                activeDot={false}
              />
            )}
            {series.map((s) => (
              <Line
                key={s.key}
                dataKey={s.key}
                name={s.label}
                hide={hidden.has(s.key)}
                type="linear"
                stroke={s.color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                dot={showDots ? { r: 3, fill: s.color, stroke: 'var(--card)', strokeWidth: 2 } : false}
                activeDot={{ r: 4, fill: s.color, stroke: 'var(--card)', strokeWidth: 2 }}
                isAnimationActive={false}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ============================================================================
// TOOLTIP
// ============================================================================

function SeriesTooltip({
  active,
  payload,
  label,
  series,
  hidden,
  granularity,
  formatValue,
}: TooltipProps<number, string> & {
  series: TimeSeries[];
  hidden: ReadonlySet<string>;
  granularity: Granularity;
  formatValue: (value: number) => string;
}) {
  if (!active || !payload?.length || typeof label !== 'number') return null;
  const row = payload[0].payload as Record<string, number>;

  return (
    <div className="min-w-[140px] rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <p className="mb-1.5 text-muted-foreground">{formatBucket(label, granularity)}</p>
      <ul className="space-y-1">
        {series
          .filter((s) => !hidden.has(s.key))
          .map((s) => (
            <li key={s.key} className="flex items-center gap-2">
              <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden />
              <span className="font-semibold tabular-nums">{formatValue(row[s.key] ?? 0)}</span>
              <span className="text-muted-foreground">{s.label}</span>
            </li>
          ))}
      </ul>
    </div>
  );
}
