// app/analytics/_components/viz/StatTile.tsx

'use client';

import { AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, CheckCircle2, CircleAlert, Minus } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { Skeleton } from '@/shared/ui/components/skeleton';

import type { Change } from './change';

// ============================================================================
// TYPES
// ============================================================================

export type StatusTone = 'good' | 'warning' | 'critical' | 'neutral';

interface StatTileProps {
  label: string;
  value: string;
  /** One line under the value: what it counts, or a secondary figure */
  hint?: ReactNode;
  /** State of the value, always shown as icon + words, never colour alone */
  status?: { tone: StatusTone; label: string };
  /** Values over the selected period, oldest first */
  trend?: number[];
  /** Formats trend values for screen readers */
  trendFormat?: (value: number) => string;
  /** Describes the trend for screen readers, e.g. "Searches per hour" */
  trendLabel?: string;
  loading?: boolean;
  /** How the value moved since the previous period */
  change?: Change | null;
  /** The period it is compared with, e.g. "Oct 12 – Oct 18" */
  comparedWith?: string;
}

const STATUS_STYLE: Record<StatusTone, { icon: React.ElementType; className: string }> = {
  good: { icon: CheckCircle2, className: 'text-viz-good' },
  warning: { icon: AlertTriangle, className: 'text-viz-warning' },
  critical: { icon: CircleAlert, className: 'text-viz-critical' },
  neutral: { icon: Minus, className: 'text-muted-foreground' },
};

// ============================================================================
// COMPONENT
// ============================================================================

export function StatTile({ label, value, hint, status, trend, trendFormat, trendLabel, loading, change, comparedWith }: StatTileProps) {
  if (loading) return <Skeleton className="h-[132px] rounded-2xl" />;

  const StatusIcon = status ? STATUS_STYLE[status.tone].icon : null;

  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-muted-foreground">{label}</p>
        {status && StatusIcon && (
          <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-foreground">
            <StatusIcon className={cn('size-3.5', STATUS_STYLE[status.tone].className)} aria-hidden />
            {status.label}
          </span>
        )}
      </div>
      <div className="flex min-w-0 items-baseline gap-2">
        <p className="truncate text-3xl font-semibold tracking-tight" title={value}>{value}</p>
        {change && <ChangeNote change={change} comparedWith={comparedWith} />}
      </div>
      {trend && trend.length > 1 && <Sparkline values={trend} label={trendLabel ?? label} format={trendFormat} />}
      {/* Pinned to the bottom, so tiles with and without a trend line up in a row */}
      {hint && <p className="mt-auto text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ============================================================================
// CHANGE
// ============================================================================

const CHANGE_ICON = { up: ArrowUpRight, down: ArrowDownRight, flat: ArrowRight } as const;
const CHANGE_COLOR = { good: 'text-viz-good', bad: 'text-viz-critical', neutral: 'text-muted-foreground' } as const;
const CHANGE_WORD = { up: 'Up', down: 'Down', flat: 'No change' } as const;

/** "↗ 12% vs prev.": the arrow carries direction and, by colour, whether that's good; the words say both */
export function ChangeNote({ change, comparedWith }: { change: Change; comparedWith?: string }) {
  const Icon = CHANGE_ICON[change.direction];
  const against = comparedWith ? `the previous period (${comparedWith})` : 'the previous period';
  const verdict = change.sentiment === 'good' ? ', better' : change.sentiment === 'bad' ? ', worse' : '';
  const description =
    change.direction === 'flat'
      ? `No change from ${against}`
      : `${CHANGE_WORD[change.direction]} ${change.amount} from ${against}${verdict}`;

  return (
    <span className="flex shrink-0 items-center gap-0.5 text-xs" title={description}>
      <Icon className={cn('size-3.5', CHANGE_COLOR[change.sentiment])} aria-hidden />
      <span aria-hidden>
        {change.direction === 'flat' ? (
          <span className="text-muted-foreground">same as prev.</span>
        ) : (
          <>
            <span className="font-medium tabular-nums text-foreground">{change.amount}</span>
            <span className="text-muted-foreground"> vs prev.</span>
          </>
        )}
      </span>
      <span className="sr-only">{description}</span>
    </span>
  );
}

// ============================================================================
// SPARKLINE
// ============================================================================

/** Trend in a muted line, with the latest point marked in the accent colour. */
export function Sparkline({
  values,
  label,
  format = String,
  height = 32,
}: {
  values: number[];
  label: string;
  format?: (value: number) => string;
  height?: number;
}) {
  const width = 200;
  const pad = 4;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const x = (i: number) => pad + (i / (values.length - 1)) * (width - pad * 2);
  const y = (v: number) => height - pad - ((v - min) / span) * (height - pad * 2);
  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const last = values.length - 1;

  return (
    <div
      className="relative h-8 w-full"
      role="img"
      aria-label={`${label}: from ${format(values[0])} to ${format(values[last])}, high ${format(max)}, low ${format(min)}`}
    >
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="size-full overflow-visible" aria-hidden>
        <polyline
          points={points}
          fill="none"
          stroke="var(--muted-foreground)"
          strokeOpacity={0.55}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {/* The stretched SVG would turn a circle into an ellipse, so the end dot is HTML */}
      <span
        className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-viz-1 ring-2 ring-card"
        style={{ left: `${(x(last) / width) * 100}%`, top: `${(y(values[last]) / height) * 100}%` }}
        aria-hidden
      />
    </div>
  );
}
