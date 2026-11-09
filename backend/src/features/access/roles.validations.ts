// src/features/access/roles.validations.ts

import { z } from 'zod';

import { isPermission } from './permissions';

const permissionsSchema = z
  .array(z.string())
  .max(100)
  .refine((list) => list.every(isPermission), { message: 'Unknown permission' })
  .transform((list) => [...new Set(list)].sort());

export const createRoleSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(64),
  description: z.string().trim().max(500).optional().nullable(),
  permissions: permissionsSchema,
});

export const updateRoleSchema = createRoleSchema.partial();

export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
