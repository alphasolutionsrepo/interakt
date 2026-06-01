'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Activity, AlertTriangle, Clock, Gauge, Workflow } from 'lucide-react';
import { getErrorRateColor } from '@/features/analytics/analytics-thresholds';
import type { SpanMetrics } from '../_lib/api-client';

interface SpanMetricsBarProps {
  metrics: SpanMetrics | undefined;
  isLoading: boolean;
}

function formatDuration(ms: number): string {
  if (ms < 1) return '<1ms';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function SpanMetricsBar({ metrics, isLoading }: SpanMetricsBarProps) {
  // Async task health: surfaces fire-and-forget post-turn failures (memory
  // extraction, summarization) that don't reach the user but otherwise rot
  // silently in stderr. Red when any failed; muted otherwise.
  const asyncErrors = metrics?.asyncTasks.errors ?? 0;
  const asyncTotal = metrics?.asyncTasks.total ?? 0;
  const asyncTooltip = metrics?.asyncTasks.byOperation
    .map((o) => `${o.operation.replace('pipeline.post.', '')}: ${o.errors}/${o.total} failed`)
    .join('\n');

  const items = [
    {
      label: 'Total Spans',
      value: metrics?.totalSpans.toLocaleString() ?? '-',
      icon: Activity,
      className: 'text-foreground',
    },
    {
      label: 'Error Rate',
      value: metrics ? `${metrics.errorRate.toFixed(1)}%` : '-',
      icon: AlertTriangle,
      className: metrics ? getErrorRateColor(metrics.errorRate) : 'text-foreground',
    },
    {
      label: 'Avg Duration',
      value: metrics ? formatDuration(metrics.avgDurationMs) : '-',
      icon: Clock,
      className: 'text-foreground',
    },
    {
      label: 'P95 Duration',
      value: metrics ? formatDuration(metrics.p95DurationMs) : '-',
      icon: Gauge,
      className: 'text-foreground',
    },
    {
      label: 'Background Failures',
      value: metrics ? `${asyncErrors} / ${asyncTotal}` : '-',
      icon: Workflow,
      className: asyncErrors > 0 ? 'text-destructive' : 'text-foreground',
      title: asyncTooltip,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
      {items.map((item) => (
        <Card key={item.label} className="py-3" title={item.title}>
          <CardContent className="flex items-center gap-3 px-4 py-0">
            <item.icon className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground truncate">{item.label}</p>
              {isLoading ? (
                <Skeleton className="mt-1 h-5 w-16" />
              ) : (
                <p className={cn('text-lg font-semibold tabular-nums leading-tight', item.className)}>
                  {item.value}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
