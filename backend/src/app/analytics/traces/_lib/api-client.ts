// app/analytics/traces/_lib/api-client.ts

export type TimeRange = '1h' | '24h' | '7d' | '30d' | '90d';

export interface SpanListItem {
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
  asyncTasks: {
    total: number;
    errors: number;
    byOperation: Array<{ operation: string; total: number; errors: number }>;
  };
}

export interface SpanFilterOptions {
  statusCode?: string;
  search?: string;
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

async function fetchApi<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }
  const json = await response.json();
  if (!json.success) {
    throw new Error(json.error || 'Unknown error');
  }
  return json as T;
}

async function deleteApi<T>(url: string): Promise<T> {
  const response = await fetch(url, { method: 'DELETE' });
  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }
  const json = await response.json();
  if (!json.success) {
    throw new Error(json.error || 'Failed to delete');
  }
  return json.data;
}

export const tracesApi = {
  list: async (
    timeRange: TimeRange,
    filters?: SpanFilterOptions,
    limit = 100,
    offset = 0
  ): Promise<SpanListResponse> => {
    const p = new URLSearchParams({ timeRange, limit: String(limit), offset: String(offset) });
    if (filters?.statusCode) p.set('statusCode', filters.statusCode);
    if (filters?.search) p.set('search', filters.search);
    if (filters?.rootOnly) p.set('rootOnly', 'true');
    if (filters?.experienceId) p.set('experienceId', filters.experienceId);

    const json = await fetchApi<{ data: SpanListItem[]; pagination: SpanListResponse['pagination'] }>(
      `/api/telemetry/traces?${p.toString()}`
    );
    return { spans: json.data, pagination: json.pagination };
  },

  getById: async (spanId: string): Promise<SpanDetail> => {
    const json = await fetchApi<{ data: SpanDetail }>(`/api/telemetry/traces/${spanId}`);
    return json.data;
  },

  getTraceSpans: async (traceId: string): Promise<SpanDetail[]> => {
    const json = await fetchApi<{ data: SpanDetail[] }>(`/api/telemetry/traces/trace/${traceId}`);
    return json.data;
  },

  getMetrics: async (timeRange: TimeRange): Promise<SpanMetrics> => {
    const json = await fetchApi<{ data: SpanMetrics }>(`/api/telemetry/traces/metrics?timeRange=${timeRange}`);
    return json.data;
  },

  deleteSpan: async (spanId: string) => deleteApi(`/api/telemetry/traces/${spanId}`),

  deleteAll: async () => deleteApi<{ deleted: boolean; count: number }>('/api/telemetry/traces'),
};
