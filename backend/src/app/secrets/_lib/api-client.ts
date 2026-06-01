// app/secrets/_lib/api-client.ts

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

export interface SecretMetadata {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSecretPayload {
  name: string;
  value: string;
  description?: string;
}

export interface UpdateSecretPayload {
  value?: string;
  description?: string;
}

export const secretsApi = {
  list: async (search?: string): Promise<SecretMetadata[]> => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    const url = `/api/secrets${params.toString() ? `?${params.toString()}` : ''}`;
    const response = await fetch(url);
    const json = await response.json();
    if (!response.ok) {
      throw new ApiError(json.error || json.message || 'An error occurred', response.status);
    }
    return json.data ?? json;
  },

  create: async (data: CreateSecretPayload): Promise<SecretMetadata> => {
    const response = await fetch('/api/secrets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<SecretMetadata>(response);
  },

  update: async (id: string, data: UpdateSecretPayload): Promise<SecretMetadata> => {
    const response = await fetch(`/api/secrets/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<SecretMetadata>(response);
  },

  delete: async (id: string): Promise<void> => {
    const response = await fetch(`/api/secrets/${id}`, { method: 'DELETE' });
    await handleResponse<void>(response);
  },
};
