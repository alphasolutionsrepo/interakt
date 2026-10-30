// app/dashboard/_components/MetricsStrip.tsx

'use client';

/**
 * The thin line of headline figures at the top of the home page: each with its
 * trend and how it moved since the 7 days before. Small samples say so instead
 * of reading as a verdict.
 */

import { AlertTriangle, CheckCircle2, CircleAlert, CircleHelp } from 'lucide-react';
import Link from 'next/link';

import type { HomeData, HomeMetric } from '../_lib/useHome';

import {
  ChangeNote,
  Sparkline,
  compareRates,
  compareValues,
  formatCompact,
  formatPercent,
  formatTimeAgo,
  pluralize,
} from '@/app/analytics/_components/viz';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/shared/ui/components/skeleton';


/** Below this many events a change is shown, but marked as a small sample */
const SMALL_SAMPLE = 20;

function Metric({ metric, comparedWith }: { metric: HomeMetric; comparedWith: string }) {
  const change =
    metric.kind === 'rate'
      ? compareRates(metric.value, metric.previous, { higherIsBetter: metric.higherIsBetter })
      : metric.value !== null && metric.previous !== null
        ? compareValues(metric.value, metric.previous, { higherIsBetter: metric.higherIsBetter })
        : null;
  const value =
    metric.value === null ? '—' : metric.kind === 'rate' ? formatPercent(metric.value) : formatCompact(metric.value);
  const trend = metric.series.filter((v): v is number => v !== null);
  const small = metric.basedOn > 0 && metric.basedOn < SMALL_SAMPLE;

  return (
    <Link
      href={metric.href}
      className="group flex min-w-0 flex-col gap-1 rounded-xl px-3 py-2 transition-colors hover:bg-muted/60"
    >
      <span className="text-xs text-muted-foreground group-hover:text-foreground">{metric.label}</span>
      <span className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-xl font-semibold tabular-nums">{value}</span>
        {change && <ChangeNote change={change} comparedWith={comparedWith} />}
      </span>
      {trend.length > 1 && (
        <div className="w-28">
          <Sparkline
            values={trend}
            label={`${metric.label} per day`}
            format={metric.kind === 'rate' ? (v) => formatPercent(v, 0) : formatCompact}
            height={20}
          />
        </div>
      )}
      {small && <span className="text-[11px] text-muted-foreground">Based on {pluralize(metric.basedOn, 'event')}</span>}
    </Link>
  );
}

export function MetricsStrip({ data, loading }: { data?: HomeData; loading: boolean }) {
  return (
    // One row on wide screens (period · figures · live); on narrow ones the period and
    // live share a line above a 2×2 grid of figures
    <section aria-label="The last 7 days" className="grid gap-x-6 gap-y-2 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-start">
      <p className="text-sm text-muted-foreground lg:pt-2">
        Last 7 days · All experiences
        {data && (
          <span className="block text-xs" title={new Date(data.generatedAt).toLocaleString()}>
            Updated {formatTimeAgo(data.generatedAt)}
          </span>
        )}
      </p>

      <div className="order-last grid grid-cols-2 gap-1 sm:grid-cols-4 lg:order-none">
        {loading || !data
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[76px] rounded-xl" />)
          : data.metrics.map((m) => <Metric key={m.key} metric={m} comparedWith={data.period.previousLabel} />)}
      </div>

      <div className="row-start-1 flex flex-col items-end gap-1 justify-self-end lg:row-auto">
        <Live count={data?.live.requestsLast5Min} />
        {data && <HealthLine health={data.health} />}
      </div>
    </section>
  );
}

/** The latest scheduled health check, linking to Health Monitoring */
function HealthLine({ health }: { health: HomeData['health'] }) {
  if (!health) {
    return (
      <Link href="/health" className="text-xs text-muted-foreground hover:underline" title="The scheduled health check hasn't run yet">
        Health not checked yet
      </Link>
    );
  }
  const problems = health.problems.length;
  const Icon = health.stale ? CircleHelp : problems === 0 ? CheckCircle2 : health.status === 'unhealthy' ? CircleAlert : AlertTriangle;
  const tone = health.stale
    ? 'text-muted-foreground'
    : problems === 0
      ? 'text-viz-good'
      : health.status === 'unhealthy'
        ? 'text-viz-critical'
        : 'text-viz-warning';
  const text = health.stale
    ? `Health last checked ${formatTimeAgo(health.checkedAt)}`
    : problems === 0
      ? 'All systems healthy'
      : `${pluralize(problems, 'service')} ${problems === 1 ? 'has' : 'have'} problems`;
  return (
    <Link
      href="/health"
      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:underline"
      title={`Checked ${formatTimeAgo(health.checkedAt)}`}
    >
      <Icon className={cn('size-3.5', tone)} aria-hidden />
      {text}
    </Link>
  );
}

/** Activity in the last 5 minutes: chat turns and searches */
function Live({ count }: { count?: number }) {
  if (count === undefined) return <div className="w-16" />;
  const active = count > 0;
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground lg:pt-2" title="Chat turns and searches in the last 5 minutes">
      <span className="relative flex size-2.5" aria-hidden>
        {active && <span className="absolute inline-flex size-full animate-ping rounded-full bg-viz-good opacity-60" />}
        <span className={cn('relative inline-flex size-2.5 rounded-full', active ? 'bg-viz-good' : 'bg-muted-foreground/40')} />
      </span>
      Live
      <span className="font-medium tabular-nums text-foreground">{count}</span>
      <span className="sr-only">requests in the last 5 minutes</span>
    </p>
  );
}
