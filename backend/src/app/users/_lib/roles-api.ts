// app/users/_lib/roles-api.ts

import type { CreateRoleInput, UpdateRoleInput } from '@/features/access/roles.validations';
import { handleApiResponse } from '@/shared/api/api-error';

export type RoleResponse = {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
  isBuiltIn: boolean;
  userCount: number;
};

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const rolesApi = {
  list: async (): Promise<RoleResponse[]> => handleApiResponse(await fetch('/api/roles')),
  create: async (data: CreateRoleInput): Promise<RoleResponse> =>
    handleApiResponse(await fetch('/api/roles', json('POST', data))),
  update: async (id: string, data: UpdateRoleInput): Promise<RoleResponse> =>
    handleApiResponse(await fetch(`/api/roles/${id}`, json('PUT', data))),
  remove: async (id: string): Promise<{ deleted: true }> =>
    handleApiResponse(await fetch(`/api/roles/${id}`, { method: 'DELETE' })),
};
