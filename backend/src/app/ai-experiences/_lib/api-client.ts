// app/ai-experiences/_lib/api-client.ts

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

export type PipelineMode = 'agentic' | 'deterministic';

export interface AIExperienceToolAssignment {
  id: string;
  toolId: string;
  overrideAiDescription: string | null;
  overrideConfig: Record<string, unknown> | null;
  isEnabled: boolean;
  sortOrder: number;
  tool: {
    id: string;
    name: string;
    slug: string;
    executorType: string;
    operation: string | null;
    aiDescription: string;
    isActive: boolean;
  };
}

export interface AIExperienceWithTools {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  pipelineMode: PipelineMode;
  pipelineConfig: Record<string, unknown> | null;
  personaConfig: Record<string, unknown>;
  guardrailConfig: Record<string, unknown> | null;
  sessionConfig: Record<string, unknown>;
  accessToken: string;
  accessConfig: Record<string, unknown>;
  observabilityConfig: Record<string, unknown>;
  providerId: string | null;
  modelId: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  tools: AIExperienceToolAssignment[];
}

export interface AIExperienceListResponse {
  experiences: AIExperienceWithTools[];
  pagination: {
    page: number;
    pageSize: number;
    totalPages: number;
    totalItems: number;
  };
}

export interface CreateAIExperiencePayload {
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  pipelineMode?: PipelineMode;
  pipelineConfig?: Record<string, unknown>;
  personaConfig: Record<string, unknown>;
  guardrailConfig?: Record<string, unknown>;
  sessionConfig: Record<string, unknown>;
  accessConfig: Record<string, unknown>;
  observabilityConfig: Record<string, unknown>;
  providerId?: string | null;
  modelId?: number | null;
  toolIds?: string[];
}

export interface UpdateAIExperiencePayload {
  name?: string;
  description?: string;
  icon?: string;
  pipelineMode?: PipelineMode;
  pipelineConfig?: Record<string, unknown>;
  personaConfig?: Record<string, unknown>;
  guardrailConfig?: Record<string, unknown> | null;
  sessionConfig?: Record<string, unknown>;
  accessConfig?: Record<string, unknown>;
  observabilityConfig?: Record<string, unknown>;
  providerId?: string | null;
  modelId?: number | null;
  isActive?: boolean;
}

export interface AssignToolPayload {
  toolId: string;
  overrideAiDescription?: string;
  overrideConfig?: Record<string, unknown>;
  isEnabled?: boolean;
  sortOrder?: number;
}

export interface UpdateToolAssignmentPayload {
  overrideAiDescription?: string | null;
  overrideConfig?: Record<string, unknown> | null;
  isEnabled?: boolean;
  sortOrder?: number;
}

export interface ListAIExperiencesParams {
  page?: number;
  pageSize?: number;
  search?: string;
  isActive?: boolean;
  pipelineMode?: PipelineMode;
  sortBy?: 'name' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

// ============================================================================
// API CLIENT
// ============================================================================

export const aiExperiencesApi = {
  list: async (params?: ListAIExperiencesParams): Promise<AIExperienceListResponse> => {
    const p = new URLSearchParams();
    if (params?.page) p.set('page', String(params.page));
    if (params?.pageSize) p.set('pageSize', String(params.pageSize));
    if (params?.search) p.set('search', params.search);
    if (params?.isActive !== undefined) p.set('isActive', String(params.isActive));
    if (params?.pipelineMode) p.set('pipelineMode', params.pipelineMode);
    if (params?.sortBy) p.set('sortBy', params.sortBy);
    if (params?.sortOrder) p.set('sortOrder', params.sortOrder);

    const url = `/api/ai-experiences${p.toString() ? `?${p.toString()}` : ''}`;
    const response = await fetch(url);
    const json = await response.json();
    if (!response.ok) throw new ApiError(json.error || json.message || 'An error occurred', response.status);
    return { experiences: json.data ?? [], pagination: json.pagination };
  },

  getById: async (id: string): Promise<AIExperienceWithTools> => {
    const response = await fetch(`/api/ai-experiences/${id}`);
    return handleResponse<AIExperienceWithTools>(response);
  },

  create: async (data: CreateAIExperiencePayload): Promise<AIExperienceWithTools> => {
    const response = await fetch('/api/ai-experiences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<AIExperienceWithTools>(response);
  },

  update: async (id: string, data: UpdateAIExperiencePayload): Promise<AIExperienceWithTools> => {
    const response = await fetch(`/api/ai-experiences/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<AIExperienceWithTools>(response);
  },

  delete: async (id: string): Promise<void> => {
    const response = await fetch(`/api/ai-experiences/${id}`, { method: 'DELETE' });
    await handleResponse<void>(response);
  },

  assignTool: async (id: string, data: AssignToolPayload): Promise<AIExperienceToolAssignment> => {
    const response = await fetch(`/api/ai-experiences/${id}/tools`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<AIExperienceToolAssignment>(response);
  },

  updateToolAssignment: async (
    id: string,
    toolId: string,
    data: UpdateToolAssignmentPayload
  ): Promise<AIExperienceToolAssignment> => {
    const response = await fetch(`/api/ai-experiences/${id}/tools/${toolId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<AIExperienceToolAssignment>(response);
  },

  removeTool: async (id: string, toolId: string): Promise<void> => {
    const response = await fetch(`/api/ai-experiences/${id}/tools/${toolId}`, { method: 'DELETE' });
    await handleResponse<void>(response);
  },

  regenerateToken: async (id: string): Promise<{ accessToken: string }> => {
    const response = await fetch(`/api/ai-experiences/${id}/regenerate-token`, { method: 'POST' });
    return handleResponse<{ accessToken: string }>(response);
  },

  checkSlug: async (slug: string, excludeId?: string): Promise<{ available: boolean }> => {
    const p = new URLSearchParams({ slug });
    if (excludeId) p.set('excludeId', excludeId);
    const response = await fetch(`/api/ai-experiences/check-slug?${p.toString()}`);
    return handleResponse<{ available: boolean }>(response);
  },
};
