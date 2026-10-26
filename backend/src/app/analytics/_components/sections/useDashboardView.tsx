// app/analytics/_components/sections/useDashboardView.tsx

'use client';

/**
 * The dashboard data every analytics section reads, for the experience and
 * period in the filter bar, with the figures the sections share worked out
 * once. The dashboard request is cached, so sections switching doesn't refetch.
 */

import { getThresholds } from '@/features/analytics/analytics-thresholds';

import { useAnalyticsContext } from '../../_lib/AnalyticsContext';
import { useAnalyticsDashboard, usePreviousAnalyticsDashboard, type DashboardTotals } from '../../_lib/hooks/useAnalytics';
import { formatSpan, previousPeriod } from '../../_lib/period';
import {
  StatTile,
  compareRates,
  compareValues,
  formatCompact,
  formatMs,
  formatPercent,
  pluralize,
  type StatusTone,
} from '../viz';
import { isBrowseQuery, safeNumber, useActivityRows } from './dashboard-cards';

const VARIANT_TONE: Record<'default' | 'success' | 'warning' | 'error', StatusTone> = {
  default: 'neutral',
  success: 'good',
  warning: 'warning',
  error: 'critical',
};
const SUCCESS_LABEL = { default: 'No data', success: 'Excellent', warning: 'Good', error: 'Needs attention' } as const;
const SPEED_LABEL = { default: 'Acceptable', success: 'Fast', warning: 'Slow' } as const;

export function useDashboardView() {
  const { experienceId, experienceType, experienceName, timeRange, period, periodLabel } = useAnalyticsContext();
  const { data, isLoading, isFetching } = useAnalyticsDashboard(period, experienceId);
  const { data: previous } = usePreviousAnalyticsDashboard(period, experienceId);
  const { rows: activity, granularity } = useActivityRows(data?.trends, period);

  const totalSearches = safeNumber(data?.overview?.totalSearches);
  const zeroResultRate = safeNumber(data?.overview?.zeroResultRate);
  const successRate = 1 - zeroResultRate;
  const avgDuration = safeNumber(data?.overview?.avgSearchDurationMs);
  const isAllExperiences = !experienceId;
  const isAIExperience = experienceType === 'ai';

  // Status variants use the env-aware thresholds, as before
  const t = getThresholds();
  const successVariant: keyof typeof SUCCESS_LABEL =
    totalSearches === 0 ? 'default'
    : successRate >= t.successRate.excellent ? 'success'
    : successRate >= t.successRate.good ? 'warning'
    : 'error';
  const speedVariant: keyof typeof SPEED_LABEL =
    totalSearches === 0 ? 'default'
    : avgDuration < t.latency.excellent ? 'success'
    : avgDuration < t.latency.acceptable ? 'default'
    : 'warning';

  // Quality score inputs — average results across the top queries, weighted by how often each was searched
  const popularSearchCount = (data?.popularQueries ?? []).reduce((sum, q) => sum + q.searchCount, 0);
  const avgResults = popularSearchCount > 0
    ? data!.popularQueries.reduce((sum, q) => sum + q.avgResults * q.searchCount, 0) / popularSearchCount
    : 0;

  // Sparklines: only buckets that had searches, so a quiet hour doesn't read as 0% success
  const searched = activity.filter((r) => r.searches > 0);
  const totalAIRequests = safeNumber(data?.aiUsage?.totalRequests);
  const conversationTurns = isAIExperience ? safeNumber(data?.overview?.totalAIRequests) : 0;

  return {
    data,
    changes: data && previous ? compareDashboards(data, previous) : null,
    comparedWith: formatSpan(previousPeriod(period)),
    isLoading,
    refreshing: isFetching && !isLoading,
    experienceId,
    experienceName,
    timeRange,
    period,
    periodLabel,
    isAllExperiences,
    isAIExperience,
    showAI: isAllExperiences || isAIExperience,
    activity,
    granularity,
    totalSearches,
    failedSearches: Math.round(totalSearches * zeroResultRate),
    zeroResultRate,
    successRate,
    avgDuration,
    p95Duration: safeNumber(data?.performance?.p95DurationMs),
    avgResults,
    successStatus: { tone: VARIANT_TONE[successVariant], label: SUCCESS_LABEL[successVariant] },
    speedStatus: { tone: VARIANT_TONE[speedVariant], label: SPEED_LABEL[speedVariant] },
    searchTrend: activity.map((r) => r.searches),
    successTrend: searched.map((r) => 1 - r.noResultRate),
    speedTrend: searched.map((r) => r.avgMs),
    totalAIRequests,
    avgAIDurationMs: safeNumber(data?.aiUsage?.avgDurationMs),
    conversationTurns,
    toolExecutions: safeNumber(data?.toolUsage?.totalExecutions),
    searchesFromToolCalls: data?.overview?.searchesFromToolCalls ?? false,
    // The most searched thing someone typed; browse requests (empty or "*") are counted separately
    topQuery: data?.popularQueries?.find((q) => !isBrowseQuery(q.query)),
    browseRequests: (data?.popularQueries ?? []).filter((q) => isBrowseQuery(q.query)).reduce((sum, q) => sum + q.searchCount, 0),
    hasData: totalSearches > 0 || totalAIRequests > 0 || conversationTurns > 0,
  };
}

export type DashboardView = ReturnType<typeof useDashboardView>;

/** How each headline figure moved since the previous period; null where there's nothing to compare */
function compareDashboards(current: DashboardTotals, previous: DashboardTotals) {
  const searches = (d: DashboardTotals) => safeNumber(d.overview?.totalSearches);
  // Rates and averages only mean something when there were searches
  const foundRate = (d: DashboardTotals) => (searches(d) > 0 ? 1 - safeNumber(d.overview?.zeroResultRate) : null);
  const searchTime = (d: DashboardTotals) => (searches(d) > 0 ? safeNumber(d.overview?.avgSearchDurationMs) : 0);
  const modelCalls = (d: DashboardTotals) => safeNumber(d.aiUsage?.totalRequests);
  const modelTime = (d: DashboardTotals) => (modelCalls(d) > 0 ? safeNumber(d.aiUsage?.avgDurationMs) : 0);

  return {
    searches: compareValues(searches(current), searches(previous)),
    foundResults: compareRates(foundRate(current), foundRate(previous), { higherIsBetter: true }),
    searchSpeed: searches(current) > 0 ? compareValues(searchTime(current), searchTime(previous), { higherIsBetter: false }) : null,
    conversationTurns: compareValues(safeNumber(current.overview?.totalAIRequests), safeNumber(previous.overview?.totalAIRequests)),
    modelCalls: compareValues(modelCalls(current), modelCalls(previous)),
    modelTime: modelCalls(current) > 0 ? compareValues(modelTime(current), modelTime(previous), { higherIsBetter: false }) : null,
    tokens: compareValues(safeNumber(current.aiUsage?.totalTokens), safeNumber(previous.aiUsage?.totalTokens)),
    cost: compareValues(safeNumber(current.aiUsage?.estimatedCostUsd), safeNumber(previous.aiUsage?.estimatedCostUsd)),
    toolCalls: compareValues(safeNumber(current.toolUsage?.totalExecutions), safeNumber(previous.toolUsage?.totalExecutions)),
  };
}

// ============================================================================
// TILES shared by more than one section
// ============================================================================

export function SearchesTile({ view }: { view: DashboardView }) {
  return (
    <StatTile
      loading={view.isLoading}
      label="Searches"
      change={view.changes?.searches}
      comparedWith={view.comparedWith}
      value={formatCompact(view.totalSearches)}
      hint={
        view.totalSearches > 0
          ? pluralize(safeNumber(view.data?.overview?.uniqueQueries), 'distinct query', 'distinct queries')
          : 'No searches in this period'
      }
      trend={view.searchTrend}
      trendFormat={formatCompact}
      trendLabel={`Searches per ${view.granularity}`}
    />
  );
}

export function FoundResultsTile({ view }: { view: DashboardView }) {
  const has = view.totalSearches > 0;
  return (
    <StatTile
      loading={view.isLoading}
      label="Found results"
      change={view.changes?.foundResults}
      comparedWith={view.comparedWith}
      value={has ? formatPercent(view.successRate) : '—'}
      status={has ? view.successStatus : undefined}
      hint={has ? `${pluralize(view.failedSearches, 'search', 'searches')} found nothing` : 'No searches in this period'}
      trend={view.successTrend}
      trendFormat={(v) => formatPercent(v, 0)}
      trendLabel={`Share of searches with results per ${view.granularity}`}
    />
  );
}

export function SearchSpeedTile({ view }: { view: DashboardView }) {
  const has = view.totalSearches > 0;
  return (
    <StatTile
      loading={view.isLoading}
      label="Search speed"
      change={view.changes?.searchSpeed}
      comparedWith={view.comparedWith}
      value={has ? formatMs(view.avgDuration) : '—'}
      status={has ? view.speedStatus : undefined}
      hint={has && view.p95Duration > 0 ? `Average · 95% under ${formatMs(view.p95Duration)}` : 'Average per search'}
      trend={view.speedTrend}
      trendFormat={formatMs}
      trendLabel={`Average search time per ${view.granularity}`}
    />
  );
}

export function ToolCallsTile({ view }: { view: DashboardView }) {
  return (
    <StatTile
      loading={view.isLoading}
      label="Tool calls"
      change={view.changes?.toolCalls}
      comparedWith={view.comparedWith}
      value={formatCompact(view.toolExecutions)}
      hint={
        view.toolExecutions > 0
          ? `${formatPercent(safeNumber(view.data?.toolUsage?.successRate))} completed without errors`
          : 'No tool calls in this period'
      }
    />
  );
}

export function ConversationTurnsTile({ view }: { view: DashboardView }) {
  return (
    <StatTile
      loading={view.isLoading}
      label="Conversation turns"
      change={view.changes?.conversationTurns}
      comparedWith={view.comparedWith}
      value={formatCompact(view.conversationTurns)}
      hint={
        view.conversationTurns > 0
          ? `${formatMs(safeNumber(view.data?.overview?.avgAIDurationMs))} per turn on average`
          : 'No conversations in this period'
      }
    />
  );
}

export function ModelCallsTile({ view, label = 'AI model calls' }: { view: DashboardView; label?: string }) {
  return (
    <StatTile
      loading={view.isLoading}
      label={label}
      change={view.changes?.modelCalls}
      comparedWith={view.comparedWith}
      value={formatCompact(view.totalAIRequests)}
      hint={view.totalAIRequests > 0 ? `${formatMs(view.avgAIDurationMs)} per call on average` : 'No AI activity in this period'}
    />
  );
}

export function TopQueryTile({ view }: { view: DashboardView }) {
  return (
    <StatTile
      loading={view.isLoading}
      label="Most popular search"
      value={view.topQuery ? view.topQuery.query : '—'}
      hint={
        view.topQuery
          ? `Searched ${pluralize(view.topQuery.searchCount, 'time')}${view.browseRequests > 0 ? `, plus ${pluralize(view.browseRequests, 'browse request')}` : ''}`
          : view.browseRequests > 0
            ? `Only browse requests (${formatCompact(view.browseRequests)}), no typed searches`
            : 'No searches in this period'
      }
    />
  );
}
