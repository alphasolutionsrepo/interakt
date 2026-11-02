// app/secrets/_lib/api-client.ts

import { ApiError, toApiError, handleApiResponse } from '@/shared/api/api-error';

export { ApiError };


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
    if (!response.ok) throw await toApiError(response);
    const json = await response.json();
    return json.data ?? json;
  },

  create: async (data: CreateSecretPayload): Promise<SecretMetadata> => {
    const response = await fetch('/api/secrets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleApiResponse<SecretMetadata>(response);
  },

  update: async (id: string, data: UpdateSecretPayload): Promise<SecretMetadata> => {
    const response = await fetch(`/api/secrets/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleApiResponse<SecretMetadata>(response);
  },

  delete: async (id: string): Promise<void> => {
    const response = await fetch(`/api/secrets/${id}`, { method: 'DELETE' });
    await handleApiResponse<void>(response);
  },
};
