// app/data-sources/_lib/api-client.ts

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) {
    throw new ApiError(
      data.error || data.message || 'An error occurred',
      response.status,
      data.details
    );
  }
  return data.data ?? data;
}

// ============================================================================
// TYPES
// ============================================================================

export type DataSourceType = 'search_index' | 'search_index_external' | 'file_store' | 'database';
export type DataSourceStatus = 'healthy' | 'degraded' | 'error' | 'unknown';

export interface DataSource {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  type: DataSourceType;
  config: Record<string, unknown>;
  schema: Record<string, unknown> | null;
  isActive: boolean;
  status: DataSourceStatus;
  lastHealthCheckAt: string | null;
  lastHealthMessage: string | null;
  documentCount: number | null;
  storageSizeBytes: number | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

export interface DataSourceListResponse {
  dataSources: DataSource[];
  pagination: {
    page: number;
    pageSize: number;
    totalPages: number;
    totalItems: number;
  };
}

export interface CreateDataSourcePayload {
  name: string;
  slug: string;
  description?: string;
  type: DataSourceType;
  config: Record<string, unknown>;
  schema?: Record<string, unknown>;
}

export interface UpdateDataSourcePayload {
  name?: string;
  description?: string;
  config?: Record<string, unknown>;
  schema?: Record<string, unknown>;
  isActive?: boolean;
}

export interface HealthCheckResult {
  status: DataSourceStatus;
  message: string;
  documentCount?: number;
  storageSizeBytes?: number;
  schema?: Record<string, unknown>;
  checkedAt: string;
}

export interface ListDataSourcesParams {
  page?: number;
  pageSize?: number;
  type?: DataSourceType;
  status?: DataSourceStatus;
  search?: string;
  isActive?: boolean;
  sortBy?: 'name' | 'createdAt' | 'type';
  sortOrder?: 'asc' | 'desc';
}

// ============================================================================
// API CLIENT
// ============================================================================

export const dataSourcesApi = {
  list: async (params?: ListDataSourcesParams): Promise<DataSourceListResponse> => {
    const p = new URLSearchParams();
    if (params?.page) p.set('page', String(params.page));
    if (params?.pageSize) p.set('pageSize', String(params.pageSize));
    if (params?.type) p.set('type', params.type);
    if (params?.status) p.set('status', params.status);
    if (params?.search) p.set('search', params.search);
    if (params?.isActive !== undefined) p.set('isActive', String(params.isActive));
    if (params?.sortBy) p.set('sortBy', params.sortBy);
    if (params?.sortOrder) p.set('sortOrder', params.sortOrder);

    const url = `/api/data-sources${p.toString() ? `?${p.toString()}` : ''}`;
    const response = await fetch(url);
    const json = await response.json();
    if (!response.ok) throw new ApiError(json.error || json.message || 'An error occurred', response.status);
    return {
      dataSources: json.data ?? [],
      pagination: json.pagination,
    };
  },

  getById: async (id: string): Promise<DataSource> => {
    const response = await fetch(`/api/data-sources/${id}`);
    return handleResponse<DataSource>(response);
  },

  create: async (data: CreateDataSourcePayload): Promise<DataSource> => {
    const response = await fetch('/api/data-sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<DataSource>(response);
  },

  update: async (id: string, data: UpdateDataSourcePayload): Promise<DataSource> => {
    const response = await fetch(`/api/data-sources/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<DataSource>(response);
  },

  delete: async (id: string): Promise<void> => {
    const response = await fetch(`/api/data-sources/${id}`, { method: 'DELETE' });
    await handleResponse<void>(response);
  },

  checkSlug: async (slug: string, excludeId?: string): Promise<{ available: boolean }> => {
    const p = new URLSearchParams({ slug });
    if (excludeId) p.set('excludeId', excludeId);
    const response = await fetch(`/api/data-sources/check-slug?${p.toString()}`);
    return handleResponse<{ available: boolean }>(response);
  },

  checkHealth: async (id: string): Promise<HealthCheckResult> => {
    const response = await fetch(`/api/data-sources/${id}/health`, { method: 'POST' });
    return handleResponse<HealthCheckResult>(response);
  },
};
