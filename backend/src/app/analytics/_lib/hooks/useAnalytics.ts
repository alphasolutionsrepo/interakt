// app/analytics/_lib/hooks/useAnalytics.ts

'use client';

import { useQuery } from '@tanstack/react-query';

export type TimeRange = '1h' | '24h' | '7d' | '30d' | '90d';

export interface OverviewMetrics {
  totalSearches: number;
  totalAIRequests: number;
  uniqueQueries: number;
  zeroResultRate: number;
  avgSearchDurationMs: number;
  avgAIDurationMs: number;
  searchesByTrigger: {
    user: number;
    ai_tool: number;
    ai_rag: number;
    system: number;
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
  totalResults: number;
  durationMs: number;
  success: boolean;
}

export interface DashboardData {
  overview: OverviewMetrics;
  trends: SearchTrendPoint[];
  popularQueries: PopularQuery[];
  zeroResults: ZeroResultQuery[];
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

async function fetchApi<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }
  const json = await response.json();
  if (!json.success) {
    throw new Error(json.error || 'Unknown error');
  }
  return json.data;
}

export function useAnalyticsDashboard(timeRange: TimeRange, experienceId?: string) {
  const params = new URLSearchParams({ timeRange });
  if (experienceId) {
    params.set('experienceId', experienceId);
  }

  return useQuery({
    queryKey: ['analytics', 'dashboard', timeRange, experienceId],
    queryFn: () => fetchApi<DashboardData>(`/api/analytics/dashboard?${params}`),
    refetchInterval: 60000, // Refresh every minute
    staleTime: 30000,
  });
}

export function useAnalyticsOverview(timeRange: TimeRange, experienceId?: string) {
  const params = new URLSearchParams({ timeRange });
  if (experienceId) {
    params.set('experienceId', experienceId);
  }

  return useQuery({
    queryKey: ['analytics', 'overview', timeRange, experienceId],
    queryFn: () => fetchApi<OverviewMetrics>(`/api/analytics/overview?${params}`),
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
    queryFn: () => fetchApi<SearchTrendPoint[]>(`/api/analytics/search/trends?${params}`),
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
    queryFn: () => fetchApi<PopularQuery[]>(`/api/analytics/search/popular?${params}`),
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
    queryFn: () => fetchApi<ZeroResultQuery[]>(`/api/analytics/search/zero-results?${params}`),
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
    queryFn: () => fetchApi<PerformanceMetrics>(`/api/analytics/search/performance?${params}`),
    refetchInterval: 60000,
    staleTime: 30000,
  });
}

export function useAIUsageMetrics(timeRange: TimeRange) {
  const params = new URLSearchParams({ timeRange });

  return useQuery({
    queryKey: ['analytics', 'ai', 'usage', timeRange],
    queryFn: () => fetchApi<AIUsageMetrics>(`/api/analytics/ai/usage?${params}`),
    refetchInterval: 60000,
    staleTime: 30000,
  });
}

export function useToolUsageMetrics(timeRange: TimeRange) {
  const params = new URLSearchParams({ timeRange });

  return useQuery({
    queryKey: ['analytics', 'ai', 'tools', timeRange],
    queryFn: () => fetchApi<ToolUsageMetrics>(`/api/analytics/ai/tools?${params}`),
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
    queryFn: () => fetchApi<RecentSearchEvent[]>(`/api/analytics/search/recent?${params}`),
    refetchInterval: 10000, // Every 10 seconds for live feed
    staleTime: 5000,
  });
}

export function useAnalyticsStatus() {
  return useQuery({
    queryKey: ['analytics', 'status'],
    queryFn: () => fetchApi<QueueStats>('/api/analytics/status'),
    refetchInterval: 5000,
    staleTime: 2000,
  });
}
