// app/analytics/traces/_lib/api-client.ts

import { handleApiPage, handleApiResponse } from '@/shared/api/api-error';
import type { TraceListFacts } from '@/features/telemetry/telemetry.types';
import { approximateTimeRange, periodParams, type Period } from '../../_lib/period';

export type TimeRange = '1h' | '24h' | '7d' | '30d' | '90d';

export interface SpanListItem extends TraceListFacts {
  id: string;
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  operationName: string;
  serviceName: string;
  spanKind: string;
  startTime: string;
  endTime: string;
  durationMs: number;
  statusCode: string;
  statusMessage: string | null;
  experienceId: string | null;
  experienceType: string | null;
  pipelineType: string | null;
  requestId: string | null;
  sessionId: string | null;
  userMessage: string | null;
  experienceSlug: string | null;
  /** A summary the visitor left before it finished */
  cancelled: boolean;
}

export interface SpanDetail extends SpanListItem {
  attributes: Record<string, unknown>;
  events: Array<{
    name: string;
    timestamp: string;
    attributes: Record<string, unknown>;
  }>;
  createdAt: string;
}

export interface SpanMetrics {
  totalSpans: number;
  errorCount: number;
  errorRate: number;
  avgDurationMs: number;
  p95DurationMs: number;
  topOperations: Array<{ operation: string; count: number; avgDurationMs: number }>;
  /** Request-level turns: what the list shows */
  turns: { total: number; errors: number; avgDurationMs: number; p95DurationMs: number };
  asyncTasks: {
    total: number;
    errors: number;
    byOperation: Array<{ operation: string; total: number; errors: number }>;
  };
}

export interface SpanFilterOptions {
  statusCode?: string;
  search?: string;
  /** One trace, whenever it happened */
  traceId?: string;
  rootOnly?: boolean;
  experienceId?: string;
}

export interface SpanListResponse {
  spans: SpanListItem[];
  pagination: {
    page: number;
    pageSize: number;
    totalPages: number;
    totalItems: number;
  };
}

/**
 * The period as traces expects it: the nearest fixed range (its required
 * parameter) plus the exact instants, which take priority on the server.
 */
function periodSearchParams(period: Period): URLSearchParams {
  const { from, to } = periodParams(period);
  return new URLSearchParams({ timeRange: approximateTimeRange(period), from, to });
}

export const tracesApi = {
  list: async (
    period: Period,
    filters?: SpanFilterOptions,
    limit = 100,
    offset = 0
  ): Promise<SpanListResponse> => {
    const p = periodSearchParams(period);
    p.set('limit', String(limit));
    p.set('offset', String(offset));
    if (filters?.statusCode) p.set('statusCode', filters.statusCode);
    if (filters?.search) p.set('search', filters.search);
    if (filters?.traceId) p.set('traceId', filters.traceId);
    if (filters?.rootOnly) p.set('rootOnly', 'true');
    if (filters?.experienceId) p.set('experienceId', filters.experienceId);

    const { data, pagination } = await handleApiPage<SpanListItem, SpanListResponse['pagination']>(
      await fetch(`/api/telemetry/traces?${p.toString()}`)
    );
    return { spans: data, pagination };
  },

  getById: async (spanId: string): Promise<SpanDetail> => {
    return handleApiResponse<SpanDetail>(await fetch(`/api/telemetry/traces/${spanId}`));
  },

  getTraceSpans: async (traceId: string): Promise<SpanDetail[]> => {
    return handleApiResponse<SpanDetail[]>(await fetch(`/api/telemetry/traces/trace/${traceId}`));
  },

  getMetrics: async (period: Period, experienceId?: string): Promise<SpanMetrics> => {
    const params = periodSearchParams(period);
    if (experienceId) params.set('experienceId', experienceId);
    return handleApiResponse<SpanMetrics>(await fetch(`/api/telemetry/traces/metrics?${params}`));
  },

  deleteSpan: async (spanId: string) =>
    handleApiResponse<{ deleted: boolean; spanId: string }>(await fetch(`/api/telemetry/traces/${spanId}`, { method: 'DELETE' })),

  deleteAll: async () =>
    handleApiResponse<{ deleted: boolean; count: number }>(await fetch('/api/telemetry/traces', { method: 'DELETE' })),
};
