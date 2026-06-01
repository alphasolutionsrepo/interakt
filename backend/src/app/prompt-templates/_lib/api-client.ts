// app/prompt-templates/_lib/api-client.ts

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
      data.details,
    );
  }
  return data.data ?? data;
}

// ============================================================================
// TYPES
// ============================================================================

export type PromptTemplateStep =
  | 'turn_planner'
  | 'param_extraction'
  | 'response_synthesis'
  | 'response_synthesis_direct'
  | 'response_synthesis_lightweight'
  | 'agentic_loop';

export type PromptTemplateStatus = 'draft' | 'active' | 'archived';

export interface PromptVariable {
  name: string;
  description: string;
  source: 'pipeline_context' | 'experience_config' | 'tool_schema' | 'action_results';
}

export interface PromptSection {
  id: string;
  label: string;
  startMarker: string;
  endMarker: string;
  editable: boolean;
}

export interface PromptTemplateMetadata {
  variables: PromptVariable[];
  sections: PromptSection[];
}

export interface PromptTemplate {
  id: string;
  step: PromptTemplateStep;
  version: number;
  parentId: string | null;
  label: string | null;
  content: string;
  metadata: PromptTemplateMetadata;
  status: PromptTemplateStatus;
  isSystemDefault: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedBy: string | null;
  updatedAt: string;
}

export interface ListTemplatesParams {
  step?: PromptTemplateStep;
  status?: PromptTemplateStatus;
}

export interface CreateVersionPayload {
  parentId: string;
  content: string;
  label?: string;
  metadata?: PromptTemplateMetadata;
}

export interface RollbackPayload {
  targetVersionId: string;
}

export interface SetExperienceOverridePayload {
  step: PromptTemplateStep;
  templateId: string;
}

export interface ExperienceOverride {
  id: string;
  aiExperienceId: string;
  step: PromptTemplateStep;
  templateId: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// API CLIENT
// ============================================================================

export const promptTemplatesApi = {
  list: async (params?: ListTemplatesParams): Promise<PromptTemplate[]> => {
    const p = new URLSearchParams();
    if (params?.step) p.set('step', params.step);
    if (params?.status) p.set('status', params.status);

    const url = `/api/prompt-templates${p.toString() ? `?${p.toString()}` : ''}`;
    const response = await fetch(url);
    return handleResponse<PromptTemplate[]>(response);
  },

  getById: async (id: string): Promise<PromptTemplate> => {
    const response = await fetch(`/api/prompt-templates/${id}`);
    return handleResponse<PromptTemplate>(response);
  },

  getDefaults: async (): Promise<Record<string, PromptTemplate>> => {
    const response = await fetch('/api/prompt-templates/defaults');
    return handleResponse<Record<string, PromptTemplate>>(response);
  },

  getHistory: async (id: string): Promise<PromptTemplate[]> => {
    const response = await fetch(`/api/prompt-templates/${id}/history`);
    return handleResponse<PromptTemplate[]>(response);
  },

  createVersion: async (data: CreateVersionPayload): Promise<PromptTemplate> => {
    const response = await fetch('/api/prompt-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<PromptTemplate>(response);
  },

  rollback: async (id: string, data: RollbackPayload): Promise<PromptTemplate> => {
    const response = await fetch(`/api/prompt-templates/${id}/rollback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<PromptTemplate>(response);
  },

  // Experience overrides
  getExperienceOverrides: async (experienceId: string): Promise<ExperienceOverride[]> => {
    const response = await fetch(`/api/ai-experiences/${experienceId}/prompt-overrides`);
    return handleResponse<ExperienceOverride[]>(response);
  },

  setExperienceOverride: async (experienceId: string, data: SetExperienceOverridePayload): Promise<ExperienceOverride> => {
    const response = await fetch(`/api/ai-experiences/${experienceId}/prompt-overrides`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<ExperienceOverride>(response);
  },

  removeExperienceOverride: async (experienceId: string, step: PromptTemplateStep): Promise<void> => {
    const response = await fetch(`/api/ai-experiences/${experienceId}/prompt-overrides/${step}`, {
      method: 'DELETE',
    });
    await handleResponse<void>(response);
  },
};
