'use client';

import { StatTile, formatCompact, formatMs, formatPercent, pluralize } from '../../_components/viz';
import type { SpanMetrics } from '../_lib/api-client';

interface SpanMetricsBarProps {
  metrics: SpanMetrics | undefined;
  isLoading: boolean;
}

/**
 * Headline figures for the turns the list below shows (chat turns and search
 * requests), so the error rate matches the red rows. Background tasks are the
 * fire-and-forget work after a turn (memory extraction, summaries): they fail
 * silently otherwise.
 */
export function SpanMetricsBar({ metrics, isLoading }: SpanMetricsBarProps) {
  const turns = metrics?.turns;
  const errorRate = turns && turns.total > 0 ? turns.errors / turns.total : 0;
  const asyncErrors = metrics?.asyncTasks.errors ?? 0;
  const asyncTotal = metrics?.asyncTasks.total ?? 0;
  const asyncDetail = metrics?.asyncTasks.byOperation
    .filter((o) => o.errors > 0)
    .map((o) => `${o.operation.replace('pipeline.post.', '')} ${o.errors}/${o.total}`)
    .join(', ');

  return (
    <div className="grid gap-4 @lg:grid-cols-2 @5xl:grid-cols-4">
      <StatTile
        loading={isLoading}
        label="Turns"
        value={formatCompact(turns?.total ?? 0)}
        hint="Chat turns and search requests"
      />
      <StatTile
        loading={isLoading}
        label="Errored"
        value={turns && turns.total > 0 ? formatPercent(errorRate) : '—'}
        status={
          turns && turns.total > 0
            ? turns.errors === 0
              ? { tone: 'good', label: 'None' }
              : { tone: errorRate >= 0.05 ? 'critical' : 'warning', label: pluralize(turns.errors, 'turn') }
            : undefined
        }
        hint={turns && turns.errors > 0 ? 'Shown in red below' : 'No turns failed'}
      />
      <StatTile
        loading={isLoading}
        label="Turn time"
        value={turns && turns.total > 0 ? formatMs(turns.avgDurationMs) : '—'}
        hint={turns && turns.total > 0 ? `Average · 95% under ${formatMs(turns.p95DurationMs)}` : 'Average per turn'}
      />
      <StatTile
        loading={isLoading}
        label="Background tasks failed"
        value={asyncTotal > 0 ? `${formatCompact(asyncErrors)} of ${formatCompact(asyncTotal)}` : '—'}
        status={asyncTotal > 0 ? (asyncErrors > 0 ? { tone: 'warning', label: 'Failures' } : { tone: 'good', label: 'None' }) : undefined}
        hint={asyncDetail || 'Memory and summaries after a turn, all experiences'}
      />
    </div>
  );
}
