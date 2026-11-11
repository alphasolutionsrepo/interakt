// app/tools/_lib/api-client.ts

import { ApiError, apiErrorFrom, handleApiPage, handleApiResponse, readApiBody, type ApiErrorBody } from '@/shared/api/api-error';
import type { LookupFieldCandidate, LookupFieldRules } from '@/features/tools/executors/data-source/lookup-field-rules';

export { ApiError };


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
  /** Part of the built-in help: only an Admin changes it */
  isBuiltIn: boolean;
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
  /** Why the tool can't be added to an AI experience yet (a Find Record tool not set up) */
  notReadyReason?: string;
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

/** A Find Record tool's name and code fields against its data source (GET /api/tools/:id/lookup-fields). */
export type { LookupFieldCandidate, LookupFieldRules };

export interface LookupFieldsStatus {
  candidates: LookupFieldCandidate[];
  rules: LookupFieldRules;
  chosen: { nameFields: string[]; codeFields: string[] };
  /** Has name or code fields (or a hand-set idField), so it can be added to an AI experience */
  configured: boolean;
  /** Chosen fields the data source no longer has */
  missing: string[];
  /** Saved fields that can't work any more (the index changed since) */
  errors: Array<{ field: string; message: string }>;
  warnings: Array<{ field: string; message: string }>;
  suggested: { nameFields: string[]; codeFields: string[] };
}

/** What a test run of a tool returned */
export interface ToolTestResult {
  success: boolean;
  data?: unknown;
  error?: string;
  durationMs: number;
}

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
    const { data, pagination } = await handleApiPage<ToolWithUsage, ToolListResponse['pagination']>(await fetch(url));
    return { tools: data, pagination };
  },

  getById: async (id: string): Promise<ToolWithUsage> => {
    const response = await fetch(`/api/tools/${id}`);
    return handleApiResponse<ToolWithUsage>(response);
  },

  create: async (data: CreateToolPayload): Promise<ToolWithUsage> => {
    const response = await fetch('/api/tools', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleApiResponse<ToolWithUsage>(response);
  },

  update: async (id: string, data: UpdateToolPayload): Promise<ToolWithUsage> => {
    const response = await fetch(`/api/tools/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleApiResponse<ToolWithUsage>(response);
  },

  delete: async (id: string): Promise<void> => {
    const response = await fetch(`/api/tools/${id}`, { method: 'DELETE' });
    await handleApiResponse<void>(response);
  },

  getAllActive: async (): Promise<ToolWithUsage[]> => {
    const response = await fetch('/api/tools/all');
    return handleApiResponse<ToolWithUsage[]>(response);
  },

  checkSlug: async (slug: string, excludeId?: string): Promise<{ available: boolean }> => {
    const p = new URLSearchParams({ slug });
    if (excludeId) p.set('excludeId', excludeId);
    const response = await fetch(`/api/tools/check-slug?${p.toString()}`);
    return handleApiResponse<{ available: boolean }>(response);
  },

  /**
   * Run a tool with test input. A run that failed answers 422 with its result, returned
   * like any other; a 422 without a result (from a proxy, say) throws like any failure.
   */
  test: async (id: string, input: Record<string, unknown>): Promise<ToolTestResult> => {
    const response = await fetch(`/api/tools/${id}/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input }),
    });
    if (response.status === 422) {
      const body = await readApiBody(response);
      const json = body !== null && typeof body === 'object' ? (body as ApiErrorBody & { data?: Partial<ToolTestResult> }) : undefined;
      if (typeof json?.data?.success === 'boolean') return json.data as ToolTestResult;
      throw apiErrorFrom(json, 422, 'The test run failed');
    }
    return handleApiResponse<ToolTestResult>(response, 'The test run failed');
  },

  /** A Find Record tool's fields status; null for tools that don't take name or code fields */
  getLookupFields: async (id: string): Promise<LookupFieldsStatus | null> => {
    const response = await fetch(`/api/tools/${id}/lookup-fields`);
    return handleApiResponse<LookupFieldsStatus | null>(response);
  },

  getExperiences: async (id: string): Promise<{ id: string; name: string; slug: string; isActive: boolean }[]> => {
    const response = await fetch(`/api/tools/${id}/experiences`);
    return handleApiResponse<{ id: string; name: string; slug: string; isActive: boolean }[]>(response);
  },

  // ── New executor model endpoints ──────────────────────────────────────────

  /** Get platform capabilities (supported operations per data source type, standalone executors) */
  getCapabilities: async (): Promise<CapabilitiesResponse> => {
    const response = await fetch('/api/tools/capabilities');
    return handleApiResponse<CapabilitiesResponse>(response);
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
    return handleApiResponse<GenerateDescriptionResponse>(response);
  },

  /** Scaffold all supported tools for a data source */
  scaffoldTools: async (dataSourceId: string): Promise<ScaffoldToolsResponse> => {
    const response = await fetch('/api/tools/scaffold', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataSourceId }),
    });
    return handleApiResponse<ScaffoldToolsResponse>(response);
  },

  /** Get tools linked to a data source */
  getByDataSource: async (dataSourceId: string): Promise<ToolWithUsage[]> => {
    const response = await fetch(`/api/tools/by-data-source/${dataSourceId}`);
    return handleApiResponse<ToolWithUsage[]>(response);
  },
};
