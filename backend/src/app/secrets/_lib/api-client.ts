// app/secrets/_lib/api-client.ts

import { ApiError, apiErrorFrom } from '@/shared/api/api-error';

export { ApiError };

async function handleResponse<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok) {
    throw apiErrorFrom(data, response.status);
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
      throw apiErrorFrom(json, response.status);
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
