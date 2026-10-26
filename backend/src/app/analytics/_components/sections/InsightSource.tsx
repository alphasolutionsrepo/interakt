// app/analytics/_components/sections/InsightSource.tsx

'use client';

/**
 * Where a section's insight figures come from: the insights job, for which
 * period, and when. Also the message to show instead of figures when there are
 * none, so a missing result never reads as zero.
 */

import { AlertTriangle, Info, Loader2 } from 'lucide-react';

import { useAnalyticsContext } from '../../_lib/AnalyticsContext';
import type { InsightsRange, StoredInsightResult } from '../../_lib/hooks/useAnalytics';
import { isCustom } from '../../_lib/period';
import { formatTimeAgo } from '../viz';

const RANGE_LABEL: Record<InsightsRange, string> = { '24h': 'last 24 hours', '7d': 'last 7 days', '30d': 'last 30 days' };

export function InsightSourceNote({ result }: { result?: StoredInsightResult<unknown> }) {
  const { period, periodLabel } = useAnalyticsContext();
  if (!result) return null;
  const selectedLabel = periodLabel.toLowerCase();
  // Insights exist for these three presets only; any other period shows the nearest
  const differs = isCustom(period) || period.preset !== result.timeRange;

  return (
    <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
      <Info className="size-3.5" aria-hidden />
      <span>
        From insights computed for the {RANGE_LABEL[result.timeRange]}
        {result.processedAt && <>, updated {formatTimeAgo(result.processedAt)}</>}
        {differs && <> (insights aren&apos;t computed for the {selectedLabel})</>}.
      </span>
    </p>
  );
}

/** Shown in place of figures when the insight isn't ready. Returns null when it is. */
export function InsightUnavailable({ result, loading }: { result?: StoredInsightResult<unknown>; loading: boolean }) {
  if (loading) {
    return (
      <Message icon={Loader2} spin>
        Loading insights…
      </Message>
    );
  }
  if (!result || result.status === 'unavailable') {
    return <Message icon={AlertTriangle}>Insights couldn&apos;t be loaded. The analytics database may not be configured or reachable.</Message>;
  }
  if (result.status === 'not_processed') {
    return (
      <Message icon={Info}>
        Insights haven&apos;t been computed for this period yet. They refresh every night, or use Refresh now on the Overview.
      </Message>
    );
  }
  if (result.status === 'no_data') {
    return <Message icon={Info}>No conversations in this period.</Message>;
  }
  return null;
}

function Message({ icon: Icon, spin, children }: { icon: React.ElementType; spin?: boolean; children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-xl bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
      <Icon className={spin ? 'mt-0.5 size-4 shrink-0 animate-spin' : 'mt-0.5 size-4 shrink-0'} aria-hidden />
      <span>{children}</span>
    </p>
  );
}
