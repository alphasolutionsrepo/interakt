// app/analytics/_components/NeedsAttention.tsx

'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
  EyeOff,
  Info,
  Loader2,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useState } from 'react';

import { useAnalyticsContext } from '../_lib/AnalyticsContext';
import { useAskPanel } from '../_lib/AskPanelContext';
import {
  insightsRangeFor,
  useAnalyticsInsights,
  useFindingVisibility,
  type InsightSeverity,
  type InsightsRange,
  type ProactiveInsight,
} from '../_lib/hooks/useAnalytics';

import { formatTimeAgo } from './viz';

import { cn } from '@/lib/utils';
import { Button } from '@/shared/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/components/card';
import { Skeleton } from '@/shared/ui/components/skeleton';

// ============================================================================
// PROCESSING (computing insights)
// ============================================================================

/** Insights older than this are flagged, since the nightly job should have refreshed them */
const STALE_AFTER_MS = 36 * 60 * 60 * 1000;
/** How many findings show before "Show all" */
const VISIBLE = 4;

export function useProcessingStatus(experienceId: string | undefined) {
  return useQuery({
    queryKey: ['analytics', 'processing-status', experienceId],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/process${experienceId ? `?experienceId=${experienceId}` : ''}`);
      if (!res.ok) throw new Error('Failed to fetch status');
      const json = await res.json();
      return json.data as {
        lastRun: { id: string; status: string; startedAt: string; completedAt: string | null; steps: unknown[] } | null;
        currentRun: { id: string; status: string; startedAt: string; steps: unknown[] } | null;
        isStale: boolean;
      };
    },
    refetchInterval: (query) => {
      // Poll fast (5s) only while processing is running, otherwise every 60s
      return query.state.data?.currentRun ? 5000 : 60000;
    },
    staleTime: 30000,
  });
}

export function useRefreshInsights(experienceId: string | undefined, onDone: () => void) {
  const [isProcessing, setIsProcessing] = useState(false);

  const refresh = useCallback(async () => {
    setIsProcessing(true);
    try {
      const res = await fetch('/api/analytics/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ triggeredBy: 'admin', experienceId }),
      });

      // 409: already running; the status poll picks it up
      if (res.ok) {
        // Read the SSE progress stream until processing finishes
        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (decoder.decode(value).includes('[DONE]')) break;
          }
        }
      }
    } finally {
      setIsProcessing(false);
      onDone();
    }
  }, [experienceId, onDone]);

  return { refresh, isProcessing };
}

// ============================================================================
// COMPONENT
// ============================================================================

const SEVERITY: Record<InsightSeverity, { label: string; icon: React.ElementType; stripe: string; iconClass: string }> = {
  critical: { label: 'Critical', icon: CircleAlert, stripe: 'bg-viz-critical', iconClass: 'text-viz-critical' },
  warning: { label: 'Warning', icon: AlertTriangle, stripe: 'bg-viz-warning', iconClass: 'text-viz-warning' },
  info: { label: 'Info', icon: Info, stripe: 'bg-viz-1', iconClass: 'text-viz-1' },
};

const CATEGORY_LABEL: Record<ProactiveInsight['category'], string> = {
  search_quality: 'Search quality',
  content_gap: 'Content gap',
  ai_behavior: 'AI behaviour',
  cost: 'Cost',
  demand: 'Demand',
};

/** Insights are stored for these windows only; the page period picks the nearest */
const RANGE_WORDS: Record<InsightsRange, string> = {
  '24h': 'last 24 hours',
  '7d': 'last 7 days',
  '30d': 'last 30 days',
};

/**
 * "What needs attention": the findings the insights job computed for the
 * stored window nearest the page's period, with when they were computed and a
 * way to refresh them now.
 */
export function NeedsAttention() {
  const { experienceId, experienceName, timeRange } = useAnalyticsContext();
  const queryClient = useQueryClient();
  const range = insightsRangeFor(timeRange);
  const windowWords = RANGE_WORDS[range];
  const insights = useAnalyticsInsights(experienceId, range);
  const status = useProcessingStatus(experienceId);
  const [showAll, setShowAll] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const visibility = useFindingVisibility(experienceId);

  const onDone = useCallback(() => {
    status.refetch();
    queryClient.invalidateQueries({ queryKey: ['analytics', 'insights'] });
  }, [status, queryClient]);
  const { refresh, isProcessing } = useRefreshInsights(experienceId, onDone);

  const isRunning = isProcessing || status.data?.currentRun?.status === 'running';
  const result = insights.data;
  const processedAt = result?.processedAt ? new Date(result.processedAt) : null;
  const isStale = processedAt ? Date.now() - processedAt.getTime() > STALE_AFTER_MS : false;
  const findings = result?.status === 'ready' ? result.insights : [];
  const hidden = result?.status === 'ready' ? result.hidden ?? [] : [];
  const visible = showAll ? findings : findings.slice(0, VISIBLE);

  return (
    <Card className="gap-4 rounded-2xl border-border/60 shadow-sm">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="min-w-0 space-y-1">
          <CardTitle className="text-base font-semibold">What needs attention</CardTitle>
          <p className="text-sm text-muted-foreground">
            <span className="first-letter:uppercase inline-block">{windowWords}</span> · {experienceId ? experienceName : 'All experiences'}
            {processedAt && !isRunning && (
              <span className={cn('ml-1', isStale && 'text-foreground')}>
                · {isStale && <AlertTriangle className="mr-1 inline size-3.5 text-viz-warning" aria-hidden />}
                Updated {formatTimeAgo(processedAt)}
                {isStale && ', may be out of date'}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={refresh} disabled={isRunning} className="rounded-xl">
            {isRunning ? (
              <><Loader2 className="mr-2 size-3.5 animate-spin" /> Refreshing…</>
            ) : (
              <><RefreshCw className="mr-2 size-3.5" /> Refresh now</>
            )}
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {insights.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
          </div>
        ) : isRunning && !findings.length ? (
          <Message icon={Loader2} spin>Computing insights for the {windowWords}. This can take a minute.</Message>
        ) : !result || result.status === 'unavailable' ? (
          <Message icon={AlertTriangle}>
            Insights couldn&apos;t be loaded. The analytics database may not be configured or reachable.
          </Message>
        ) : result.status === 'not_processed' ? (
          <Message icon={Info}>
            Insights haven&apos;t been computed for {experienceId ? 'this experience' : 'all experiences'} yet. They
            refresh every night, or choose <strong className="font-medium text-foreground">Refresh now</strong>.
          </Message>
        ) : result.status === 'no_data' ? (
          <Message icon={Info}>No activity in the {windowWords}, so there&apos;s nothing to review.</Message>
        ) : findings.length === 0 ? (
          <Message icon={CheckCircle2} iconClass="text-viz-good">
            {hidden.length > 0 ? `Nothing else needs attention in the ${windowWords}.` : `Nothing needs attention in the ${windowWords}.`}
          </Message>
        ) : (
          <div className="space-y-2">
            <ul className="space-y-2">
              {visible.map((finding) => (
                <Finding
                  key={finding.id}
                  finding={finding}
                  onHide={() => visibility.hide.mutate({ findingId: finding.id })}
                  hiding={visibility.hide.isPending && visibility.hide.variables?.findingId === finding.id}
                />
              ))}
            </ul>
            {findings.length > VISIBLE && (
              <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setShowAll((v) => !v)}>
                {showAll ? 'Show fewer' : `Show all ${findings.length}`}
              </Button>
            )}
          </div>
        )}
        {visibility.hide.isError && <p className="mt-2 text-sm text-destructive">Couldn&apos;t hide that finding. Try again.</p>}
        {hidden.length > 0 && (
          <div className="mt-3 border-t pt-3">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              aria-expanded={showHidden}
              onClick={() => setShowHidden((v) => !v)}
            >
              <EyeOff className="mr-1.5 size-3.5" />
              {hidden.length} hidden {showHidden ? '· Hide list' : '· Show'}
            </Button>
            {showHidden && (
              <ul className="mt-2 space-y-1">
                {hidden.map((finding) => (
                  <li key={finding.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm hover:bg-muted/50">
                    <span className="min-w-0">
                      {finding.title}
                      <span className="text-muted-foreground"> · back {formatComeBack(finding.hiddenUntil)}</span>
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 rounded-lg text-xs"
                      disabled={visibility.show.isPending}
                      onClick={() => visibility.show.mutate(finding.id)}
                    >
                      Show again
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** "on Nov 2" */
function formatComeBack(iso: string): string {
  return `on ${new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

function Finding({ finding, onHide, hiding }: { finding: ProactiveInsight; onHide: () => void; hiding: boolean }) {
  const severity = SEVERITY[finding.severity] ?? SEVERITY.info;
  const Icon = severity.icon;
  const askPanel = useAskPanel();
  return (
    <li className="grid grid-cols-[4px_minmax(0,1fr)] overflow-hidden rounded-xl border border-border/60">
      <span className={severity.stripe} aria-hidden />
      <div className="space-y-1.5 px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="flex items-center gap-1 text-xs font-medium">
            <Icon className={cn('size-3.5', severity.iconClass)} aria-hidden />
            {severity.label}
          </span>
          <span className="text-xs text-muted-foreground">{CATEGORY_LABEL[finding.category] ?? finding.category}</span>
          {finding.metric && (
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs tabular-nums">{finding.metric}</span>
          )}
        </div>
        <p className="font-medium">{finding.title}</p>
        <p className="text-sm text-muted-foreground">{finding.description}</p>
        {finding.suggestedAction && (
          <p className="text-sm">
            <span className="text-muted-foreground">Suggested: </span>
            {finding.suggestedAction}
          </p>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl"
            onClick={() =>
              askPanel.open(`Explain this finding and what's behind it: "${finding.title}". ${finding.description}`)
            }
          >
            <Sparkles className="mr-1.5 size-3.5" /> Explain this
          </Button>
          {finding.category === 'ai_behavior' && (
            <Button variant="ghost" size="sm" className="rounded-xl" asChild>
              <Link href="/analytics/traces?status=ERROR">See failed turns</Link>
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="rounded-xl text-muted-foreground"
            onClick={onHide}
            disabled={hiding}
            title="Hide this finding for 7 days, for every admin"
          >
            {hiding ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <EyeOff className="mr-1.5 size-3.5" />}
            Hide for 7 days
          </Button>
        </div>
      </div>
    </li>
  );
}

function Message({
  icon: Icon,
  iconClass,
  spin,
  children,
}: {
  icon: React.ElementType;
  iconClass?: string;
  spin?: boolean;
  children: React.ReactNode;
}) {
  return (
    <p className="flex items-start gap-2 rounded-xl bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
      <Icon className={cn('mt-0.5 size-4 shrink-0', spin && 'animate-spin', iconClass)} aria-hidden />
      <span>{children}</span>
    </p>
  );
}
