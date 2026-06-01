// app/mcp-connections/_lib/api-client.ts

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

export type McpTransport = 'streamable-http' | 'sse';
export type McpAuthType = 'none' | 'bearer' | 'header';
export type McpStatus = 'healthy' | 'degraded' | 'error' | 'unknown';

export type McpAuthConfig =
  | { type: 'none' }
  | { type: 'bearer'; secretRef: string }
  | { type: 'header'; secretRef: string; headerName: string };

export interface DiscoveredMcpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

export interface DiscoveredToolCatalog {
  tools: DiscoveredMcpTool[];
  serverInfo?: { name?: string; version?: string };
  protocolVersion?: string;
}

export interface McpConnection {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  serverUrl: string;
  transport: McpTransport;
  authConfig: McpAuthConfig | null;
  discoveredTools: DiscoveredToolCatalog | null;
  lastDiscoveredAt: string | null;
  status: McpStatus;
  lastHealthCheckAt: string | null;
  lastHealthMessage: string | null;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface McpConnectionListResponse {
  connections: McpConnection[];
  pagination: { page: number; pageSize: number; totalPages: number; totalItems: number };
}

export interface CreateMcpConnectionPayload {
  name: string;
  slug: string;
  description?: string;
  serverUrl: string;
  transport: McpTransport;
  authConfig?: McpAuthConfig;
}

export interface UpdateMcpConnectionPayload {
  name?: string;
  description?: string;
  serverUrl?: string;
  transport?: McpTransport;
  authConfig?: McpAuthConfig;
  isActive?: boolean;
}

export interface SyncResult {
  status: 'healthy' | 'degraded' | 'error';
  message: string;
  catalog?: DiscoveredToolCatalog;
  toolCount: number;
  checkedAt: string;
}

export interface ListMcpConnectionsParams {
  page?: number;
  pageSize?: number;
  status?: McpStatus;
  search?: string;
  isActive?: boolean;
  sortBy?: 'name' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

// Experience attachment types
export interface AttachmentDTO {
  id: string;
  aiExperienceId: string;
  mcpConnectionId: string;
  enabledToolNames: string[] | null;
  isEnabled: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  mcpConnection?: McpConnection;
}

export interface AttachPayload {
  mcpConnectionId: string;
  enabledToolNames?: string[] | null;
  isEnabled?: boolean;
  sortOrder?: number;
}

export interface UpdateAttachmentPayload {
  enabledToolNames?: string[] | null;
  isEnabled?: boolean;
  sortOrder?: number;
}

// ============================================================================
// CLIENT
// ============================================================================

export const mcpConnectionsApi = {
  list: async (params?: ListMcpConnectionsParams): Promise<McpConnectionListResponse> => {
    const p = new URLSearchParams();
    if (params?.page) p.set('page', String(params.page));
    if (params?.pageSize) p.set('pageSize', String(params.pageSize));
    if (params?.status) p.set('status', params.status);
    if (params?.search) p.set('search', params.search);
    if (params?.isActive !== undefined) p.set('isActive', String(params.isActive));
    if (params?.sortBy) p.set('sortBy', params.sortBy);
    if (params?.sortOrder) p.set('sortOrder', params.sortOrder);

    const url = `/api/mcp-connections${p.toString() ? `?${p.toString()}` : ''}`;
    const response = await fetch(url);
    const json = await response.json();
    if (!response.ok) {
      throw new ApiError(json.error || 'Failed to list connections', response.status);
    }
    return {
      connections: json.data ?? [],
      pagination: json.pagination,
    };
  },

  getById: async (id: string): Promise<McpConnection> => {
    const response = await fetch(`/api/mcp-connections/${id}`);
    return handleResponse<McpConnection>(response);
  },

  create: async (data: CreateMcpConnectionPayload): Promise<McpConnection> => {
    const response = await fetch('/api/mcp-connections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<McpConnection>(response);
  },

  update: async (id: string, data: UpdateMcpConnectionPayload): Promise<McpConnection> => {
    const response = await fetch(`/api/mcp-connections/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<McpConnection>(response);
  },

  delete: async (id: string): Promise<void> => {
    const response = await fetch(`/api/mcp-connections/${id}`, { method: 'DELETE' });
    await handleResponse<void>(response);
  },

  sync: async (id: string): Promise<SyncResult> => {
    const response = await fetch(`/api/mcp-connections/${id}/sync`, { method: 'POST' });
    return handleResponse<SyncResult>(response);
  },

  test: async (id: string): Promise<SyncResult> => {
    const response = await fetch(`/api/mcp-connections/${id}/test`, { method: 'POST' });
    return handleResponse<SyncResult>(response);
  },

  // Experience attachment endpoints
  listAttachments: async (experienceId: string): Promise<AttachmentDTO[]> => {
    const response = await fetch(`/api/ai-experiences/${experienceId}/mcp-connections`);
    return handleResponse<AttachmentDTO[]>(response);
  },

  attach: async (experienceId: string, payload: AttachPayload): Promise<AttachmentDTO> => {
    const response = await fetch(`/api/ai-experiences/${experienceId}/mcp-connections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return handleResponse<AttachmentDTO>(response);
  },

  updateAttachment: async (
    experienceId: string,
    connectionId: string,
    payload: UpdateAttachmentPayload,
  ): Promise<AttachmentDTO> => {
    const response = await fetch(
      `/api/ai-experiences/${experienceId}/mcp-connections/${connectionId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );
    return handleResponse<AttachmentDTO>(response);
  },

  detach: async (experienceId: string, connectionId: string): Promise<void> => {
    const response = await fetch(
      `/api/ai-experiences/${experienceId}/mcp-connections/${connectionId}`,
      { method: 'DELETE' },
    );
    await handleResponse<void>(response);
  },
};
