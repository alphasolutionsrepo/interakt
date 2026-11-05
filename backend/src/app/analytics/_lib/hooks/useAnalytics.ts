// app/analytics/_lib/hooks/useAnalytics.ts

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { browserTimeZone, periodKey, periodParams, previousPeriod, type Period } from '../period';
import { handleApiResponse, toApiError } from '@/shared/api/api-error';

export type TimeRange = '1h' | '24h' | '7d' | '30d' | '90d';

export interface OverviewMetrics {
  totalSearches: number;
  totalAIRequests: number;
  uniqueQueries: number;
  zeroResultSearches: number;
  zeroResultRate: number;
  avgSearchDurationMs: number;
  avgAIDurationMs: number;
  searchesFromToolCalls: boolean;
  searchesByTrigger: {
    user: number;
    ai_tool: number;
    lookups: number;
  };
}

export interface SearchTrendPoint {
  timestamp: string;
  totalSearches: number;
  uniqueQueries: number;
  zeroResults: number;
  avgDurationMs: number;
}

export interface PopularQuery {
  query: string;
  searchCount: number;
  /** Searches of this query that ran (failed ones left out) */
  ranCount: number;
  zeroResultCount: number;
  avgResults: number;
  clickThroughRate: number | null;
}

export interface ZeroResultQuery {
  query: string;
  occurrenceCount: number;
  firstSeen: string;
  lastSeen: string;
  status: string;
}

export interface SearchTypeBreakdown {
  lexical: number;
  semantic: number;
  hybrid: number;
}

export interface PerformanceMetrics {
  avgDurationMs: number;
  p50DurationMs: number;
  p95DurationMs: number;
  p99DurationMs: number;
  avgEsDurationMs: number;
  avgEmbeddingDurationMs: number;
}

export interface AIUsageMetrics {
  totalRequests: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  avgDurationMs: number;
  byOperation: {
    text: number;
    chat: number;
    embedding: number;
  };
}

export interface ToolUsageMetrics {
  totalExecutions: number;
  successRate: number;
  avgDurationMs: number;
  byTool: Record<string, number>;
  byCategory: Record<string, number>;
}

export interface RecentSearchEvent {
  id: string;
  timestamp: string;
  query: string;
  searchType: string;
  triggerType: string;
  triggerStep: string | null;
  totalResults: number;
  durationMs: number;
  success: boolean;
}

export interface DashboardData {
  overview: OverviewMetrics;
  trends: SearchTrendPoint[];
  popularQueries: PopularQuery[];
  /** What AI assistants searched for while answering visitors */
  assistantQueries: PopularQuery[];
  zeroResults: ZeroResultQuery[];
  /** Whether any of the assistant's searches found nothing */
  assistantHasFailedSearches: boolean;
  searchTypes: SearchTypeBreakdown;
  performance: PerformanceMetrics;
  aiUsage: AIUsageMetrics;
  toolUsage: ToolUsageMetrics;
  recentSearches: RecentSearchEvent[];
  meta: {
    timeRange: string;
    experienceId: string | null;
    generatedAt: string;
  };
}

export interface QueueStats {
  searchEvents: number;
  aiEvents: number;
  toolEvents: number;
  clickEvents: number;
  totalPending: number;
  lastFlushAt: string | null;
  flushCount: number;
  failedFlushCount: number;
}

/** An analytics endpoint's data, or an ApiError with the server's reason */
export async function fetchAnalytics<T>(url: string, fallback?: string): Promise<T> {
  return handleApiResponse<T>(await fetch(url), fallback);
}

export function useAnalyticsDashboard(period: Period, experienceId?: string) {
  return useQuery({
    // Keyed by the period's identity, so a rolling preset keeps its cache as time passes
    queryKey: ['analytics', 'dashboard', periodKey(period), experienceId],
    queryFn: () => {
      // Resolved at fetch time, so each refresh covers up to now
      const params = new URLSearchParams(periodParams(period));
      if (experienceId) params.set('experienceId', experienceId);
      return fetchAnalytics<DashboardData>(`/api/analytics/dashboard?${params}`);
    },
    refetchInterval: 60000, // Refresh every minute
    staleTime: 30000,
  });
}

/** The dashboard's headline totals only, which is all the previous-period comparison reads */
export type DashboardTotals = Pick<DashboardData, 'overview' | 'aiUsage' | 'toolUsage'>;

/**
 * Headline totals for the period just before the selected one, so figures can
 * show how they changed. Older data doesn't change, so it refreshes less often
 * than the current period.
 */
export function usePreviousAnalyticsDashboard(period: Period, experienceId?: string) {
  return useQuery({
    queryKey: ['analytics', 'dashboard-previous', periodKey(period), experienceId],
    queryFn: () => {
      const { from, to } = previousPeriod(period);
      const params = new URLSearchParams({
        timeRange: 'custom',
        from: from.toISOString(),
        to: to.toISOString(),
        tz: browserTimeZone(),
        view: 'totals',
      });
      if (experienceId) params.set('experienceId', experienceId);
      return fetchAnalytics<DashboardTotals>(`/api/analytics/dashboard?${params}`);
    },
    refetchInterval: 5 * 60000,
    staleTime: 60000,
  });
}

// ============================================================================
// PROACTIVE INSIGHTS ("What needs attention")
// ============================================================================

export type InsightSeverity = 'critical' | 'warning' | 'info';

export interface ProactiveInsight {
  id: string;
  severity: InsightSeverity;
  category: 'search_quality' | 'content_gap' | 'ai_behavior' | 'cost' | 'demand';
  title: string;
  description: string;
  metric?: string;
  suggestedAction?: string;
}

export interface ProactiveInsightsResult {
  status: 'ready' | 'no_data' | 'not_processed' | 'unavailable';
  timeRange: '24h' | '7d' | '30d';
  processedAt: string | null;
  /** Findings to show: computed, and not hidden */
  insights: ProactiveInsight[];
  /** Findings an admin hid, with when they come back */
  hidden: Array<ProactiveInsight & { hiddenUntil: string }>;
}

/** Stored insights for the experience (or all experiences). Computed by the insights job, not live. */
export function useAnalyticsInsights(experienceId?: string, timeRange: '24h' | '7d' | '30d' = '7d') {
  const params = new URLSearchParams({ timeRange });
  if (experienceId) {
    params.set('experienceId', experienceId);
  }

  return useQuery({
    queryKey: ['analytics', 'insights', timeRange, experienceId],
    queryFn: () => fetchAnalytics<ProactiveInsightsResult>(`/api/analytics/insights?${params}`),
    staleTime: 60000,
  });
}

/** Hide a finding for everyone for some days, or show a hidden one again */
export function useFindingVisibility(experienceId?: string) {
  const queryClient = useQueryClient();
  const onSuccess = () => queryClient.invalidateQueries({ queryKey: ['analytics', 'insights'] });
  const hide = useMutation({
    mutationFn: async ({ findingId, days = 7 }: { findingId: string; days?: number }) => {
      const response = await fetch('/api/analytics/insights/hidden', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ findingId, experienceId, days }),
      });
      if (!response.ok) throw await toApiError(response, 'Failed to hide finding');
    },
    onSuccess,
    meta: { label: 'Hide finding' },
  });
  const show = useMutation({
    mutationFn: async (findingId: string) => {
      const params = new URLSearchParams({ findingId });
      if (experienceId) params.set('experienceId', experienceId);
      const response = await fetch(`/api/analytics/insights/hidden?${params}`, { method: 'DELETE' });
      if (!response.ok) throw await toApiError(response, 'Failed to show finding again');
    },
    onSuccess,
    meta: { label: 'Show finding again' },
  });
  return { hide, show };
}

export type StoredInsightType = 'ai_effectiveness' | 'guardrail_analytics' | 'intent_clusters' | 'cost_analysis';
export type InsightsRange = '24h' | '7d' | '30d';

export interface StoredInsightResult<T> {
  status: ProactiveInsightsResult['status'];
  timeRange: InsightsRange;
  processedAt: string | null;
  data: T | null;
}

/**
 * Insights are only computed for 24 hours, 7 days and 30 days. The nearest one
 * stands in for other periods; pages say which period they show.
 */
export function insightsRangeFor(timeRange: TimeRange): InsightsRange {
  if (timeRange === '1h' || timeRange === '24h') return '24h';
  if (timeRange === '7d') return '7d';
  return '30d';
}

/** A stored insight for the experience (or all experiences), computed by the insights job. */
export function useStoredInsight<T>(type: StoredInsightType, timeRange: TimeRange, experienceId?: string) {
  const range = insightsRangeFor(timeRange);
  const params = new URLSearchParams({ type, timeRange: range });
  if (experienceId) {
    params.set('experienceId', experienceId);
  }

  return useQuery({
    queryKey: ['analytics', 'insights', type, range, experienceId],
    queryFn: () => fetchAnalytics<StoredInsightResult<T>>(`/api/analytics/insights?${params}`),
    staleTime: 60000,
  });
}

export function useAnalyticsOverview(timeRange: TimeRange, experienceId?: string) {
  const params = new URLSearchParams({ timeRange });
  if (experienceId) {
    params.set('experienceId', experienceId);
  }

  return useQuery({
    queryKey: ['analytics', 'overview', timeRange, experienceId],
    queryFn: () => fetchAnalytics<OverviewMetrics>(`/api/analytics/overview?${params}`),
    refetchInterval: 30000,
    staleTime: 15000,
  });
}

export function useSearchTrends(timeRange: TimeRange, experienceId?: string) {
  const params = new URLSearchParams({ timeRange });
  if (experienceId) {
    params.set('experienceId', experienceId);
  }

  return useQuery({
    queryKey: ['analytics', 'search', 'trends', timeRange, experienceId],
    queryFn: () => fetchAnalytics<SearchTrendPoint[]>(`/api/analytics/search/trends?${params}`),
    refetchInterval: 60000,
    staleTime: 30000,
  });
}

export function usePopularQueries(timeRange: TimeRange, experienceId?: string, limit = 20) {
  const params = new URLSearchParams({ timeRange, limit: String(limit) });
  if (experienceId) {
    params.set('experienceId', experienceId);
  }

  return useQuery({
    queryKey: ['analytics', 'search', 'popular', timeRange, experienceId, limit],
    queryFn: () => fetchAnalytics<PopularQuery[]>(`/api/analytics/search/popular?${params}`),
    refetchInterval: 60000,
    staleTime: 30000,
  });
}

export function useZeroResultQueries(timeRange: TimeRange, experienceId?: string, limit = 50) {
  const params = new URLSearchParams({ timeRange, limit: String(limit) });
  if (experienceId) {
    params.set('experienceId', experienceId);
  }

  return useQuery({
    queryKey: ['analytics', 'search', 'zero-results', timeRange, experienceId, limit],
    queryFn: () => fetchAnalytics<ZeroResultQuery[]>(`/api/analytics/search/zero-results?${params}`),
    refetchInterval: 120000,
    staleTime: 60000,
  });
}

export function usePerformanceMetrics(timeRange: TimeRange, experienceId?: string) {
  const params = new URLSearchParams({ timeRange });
  if (experienceId) {
    params.set('experienceId', experienceId);
  }

  return useQuery({
    queryKey: ['analytics', 'search', 'performance', timeRange, experienceId],
    queryFn: () => fetchAnalytics<PerformanceMetrics>(`/api/analytics/search/performance?${params}`),
    refetchInterval: 60000,
    staleTime: 30000,
  });
}

export function useAIUsageMetrics(timeRange: TimeRange) {
  const params = new URLSearchParams({ timeRange });

  return useQuery({
    queryKey: ['analytics', 'ai', 'usage', timeRange],
    queryFn: () => fetchAnalytics<AIUsageMetrics>(`/api/analytics/ai/usage?${params}`),
    refetchInterval: 60000,
    staleTime: 30000,
  });
}

export function useToolUsageMetrics(timeRange: TimeRange) {
  const params = new URLSearchParams({ timeRange });

  return useQuery({
    queryKey: ['analytics', 'ai', 'tools', timeRange],
    queryFn: () => fetchAnalytics<ToolUsageMetrics>(`/api/analytics/ai/tools?${params}`),
    refetchInterval: 60000,
    staleTime: 30000,
  });
}

export function useRecentSearches(experienceId?: string, limit = 20) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (experienceId) {
    params.set('experienceId', experienceId);
  }

  return useQuery({
    queryKey: ['analytics', 'search', 'recent', experienceId, limit],
    queryFn: () => fetchAnalytics<RecentSearchEvent[]>(`/api/analytics/search/recent?${params}`),
    refetchInterval: 10000, // Every 10 seconds for live feed
    staleTime: 5000,
  });
}

export function useAnalyticsStatus() {
  return useQuery({
    queryKey: ['analytics', 'status'],
    queryFn: () => fetchAnalytics<QueueStats>('/api/analytics/status'),
    refetchInterval: 5000,
    staleTime: 2000,
  });
}
