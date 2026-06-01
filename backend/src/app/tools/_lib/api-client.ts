// app/tools/_lib/api-client.ts

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

/** Executor type — how a tool runs (MCP is a separate connection type, not a tool) */
export type ExecutorType = 'data_source' | 'http' | 'web_search' | 'ai_call';

/** Data source operation — what a data_source tool does */
export type DataSourceOperation = 'search' | 'inspect' | 'enumerate' | 'lookup' | 'query';

export interface DisplayFieldConfig {
  source: string;
  role: 'title' | 'subtitle' | 'image' | 'price' | 'description' | 'rating' | 'badge' | 'link' | 'secondary';
  label?: string;
  format?: 'text' | 'currency' | 'stars' | 'date' | 'badge' | 'image_url' | 'link_url';
  currency?: string;
  priority?: 'primary' | 'secondary';
}

export interface ToolDisplayConfig {
  fields: DisplayFieldConfig[];
  preferredPresets?: Array<'single_card' | 'item_grid' | 'item_list' | 'comparison_table'>;
}

export interface ToolWithUsage {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  /** Executor type — how this tool runs */
  executorType: string;
  /** Data source operation (only for data_source executor) */
  operation: string | null;
  /** Executor-specific configuration */
  executorConfig: Record<string, unknown> | null;
  aiDescription: string;
  inputSchema: Record<string, unknown> | null;
  outputSchema: Record<string, unknown> | null;
  /** Display config — maps result fields to semantic roles for frontend rendering */
  displayConfig: ToolDisplayConfig | null;
  isActive: boolean;
  isSystem: boolean;
  dataSourceId: string | null;
  createdAt: string;
  updatedAt: string;
  experienceCount?: number;
}

export interface ToolListResponse {
  tools: ToolWithUsage[];
  pagination: {
    page: number;
    pageSize: number;
    totalPages: number;
    totalItems: number;
  };
}

export interface CreateToolPayload {
  name: string;
  slug: string;
  description?: string;
  executorType: ExecutorType;
  operation?: DataSourceOperation;
  dataSourceId?: string;
  executorConfig?: Record<string, unknown>;
  aiDescription: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

export interface UpdateToolPayload {
  name?: string;
  description?: string;
  executorConfig?: Record<string, unknown>;
  aiDescription?: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  displayConfig?: ToolDisplayConfig | null;
  isActive?: boolean;
  isSystem?: boolean;
}

export interface ListToolsParams {
  page?: number;
  pageSize?: number;
  executorType?: ExecutorType;
  operation?: DataSourceOperation;
  dataSourceId?: string;
  isSystem?: boolean;
  search?: string;
  isActive?: boolean;
  sortBy?: 'name' | 'createdAt' | 'executorType';
  sortOrder?: 'asc' | 'desc';
}

// ============================================================================
// CAPABILITY TYPES (from registry)
// ============================================================================

export interface OperationCapability {
  operation: DataSourceOperation;
  label: string;
  description: string;
  slugSuffix: string;
  aiDescriptionTemplate: string;
  supportsAutoSchema: boolean;
  defaultConfig: Record<string, unknown>;
}

export interface StandaloneExecutorCapability {
  executorType: Exclude<ExecutorType, 'data_source'>;
  label: string;
  description: string;
  icon: string;
  defaultConfig: Record<string, unknown>;
}

export interface CapabilitiesResponse {
  dataSourceCapabilities: Record<string, OperationCapability[]>;
  standaloneExecutors: StandaloneExecutorCapability[];
  allExecutorTypes: Array<{
    executorType: ExecutorType;
    label: string;
    description: string;
    requiresDataSource: boolean;
  }>;
}

export interface GenerateDescriptionResponse {
  aiDescription: string;
  inputSchema: Record<string, unknown>;
}

export interface ScaffoldToolsResponse {
  created: Array<{ id: string; name: string; slug: string; operation: string }>;
  skipped: Array<{ slug: string; operation: string; reason: string }>;
}

// ============================================================================
// API CLIENT
// ============================================================================

export const toolsApi = {
  list: async (params?: ListToolsParams): Promise<ToolListResponse> => {
    const p = new URLSearchParams();
    if (params?.page) p.set('page', String(params.page));
    if (params?.pageSize) p.set('pageSize', String(params.pageSize));
    if (params?.executorType) p.set('executorType', params.executorType);
    if (params?.operation) p.set('operation', params.operation);
    if (params?.dataSourceId) p.set('dataSourceId', params.dataSourceId);
    if (params?.isSystem !== undefined) p.set('isSystem', String(params.isSystem));
    if (params?.search) p.set('search', params.search);
    if (params?.isActive !== undefined) p.set('isActive', String(params.isActive));
    if (params?.sortBy) p.set('sortBy', params.sortBy);
    if (params?.sortOrder) p.set('sortOrder', params.sortOrder);

    const url = `/api/tools${p.toString() ? `?${p.toString()}` : ''}`;
    const response = await fetch(url);
    const json = await response.json();
    if (!response.ok) throw new ApiError(json.error || json.message || 'An error occurred', response.status);
    return {
      tools: json.data ?? [],
      pagination: json.pagination,
    };
  },

  getById: async (id: string): Promise<ToolWithUsage> => {
    const response = await fetch(`/api/tools/${id}`);
    return handleResponse<ToolWithUsage>(response);
  },

  create: async (data: CreateToolPayload): Promise<ToolWithUsage> => {
    const response = await fetch('/api/tools', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<ToolWithUsage>(response);
  },

  update: async (id: string, data: UpdateToolPayload): Promise<ToolWithUsage> => {
    const response = await fetch(`/api/tools/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<ToolWithUsage>(response);
  },

  delete: async (id: string): Promise<void> => {
    const response = await fetch(`/api/tools/${id}`, { method: 'DELETE' });
    await handleResponse<void>(response);
  },

  getAllActive: async (): Promise<ToolWithUsage[]> => {
    const response = await fetch('/api/tools/all');
    const json = await response.json();
    if (!response.ok) throw new ApiError(json.error || json.message || 'An error occurred', response.status);
    return json.data ?? json;
  },

  checkSlug: async (slug: string, excludeId?: string): Promise<{ available: boolean }> => {
    const p = new URLSearchParams({ slug });
    if (excludeId) p.set('excludeId', excludeId);
    const response = await fetch(`/api/tools/check-slug?${p.toString()}`);
    return handleResponse<{ available: boolean }>(response);
  },

  getExperiences: async (id: string): Promise<{ id: string; name: string; slug: string; isActive: boolean }[]> => {
    const response = await fetch(`/api/tools/${id}/experiences`);
    const json = await response.json();
    if (!response.ok) throw new ApiError(json.error || json.message || 'An error occurred', response.status);
    return json.data ?? json;
  },

  // ── New executor model endpoints ──────────────────────────────────────────

  /** Get platform capabilities (supported operations per data source type, standalone executors) */
  getCapabilities: async (): Promise<CapabilitiesResponse> => {
    const response = await fetch('/api/tools/capabilities');
    return handleResponse<CapabilitiesResponse>(response);
  },

  /** Generate AI description + enriched input schema for a data source tool */
  generateDescription: async (
    dataSourceId: string,
    operation: DataSourceOperation,
  ): Promise<GenerateDescriptionResponse> => {
    const response = await fetch('/api/tools/generate-description', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataSourceId, operation }),
    });
    return handleResponse<GenerateDescriptionResponse>(response);
  },

  /** Scaffold all supported tools for a data source */
  scaffoldTools: async (dataSourceId: string): Promise<ScaffoldToolsResponse> => {
    const response = await fetch('/api/tools/scaffold', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataSourceId }),
    });
    return handleResponse<ScaffoldToolsResponse>(response);
  },

  /** Get tools linked to a data source */
  getByDataSource: async (dataSourceId: string): Promise<ToolWithUsage[]> => {
    const response = await fetch(`/api/tools/by-data-source/${dataSourceId}`);
    return handleResponse<ToolWithUsage[]>(response);
  },
};
