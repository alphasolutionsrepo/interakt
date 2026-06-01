// src/features/secrets/secrets.validation.ts

import { z } from 'zod';

// ============================================================================
// SECRET SCHEMAS
// ============================================================================

export const createSecretSchema = z.object({
  name: z.string()
    .min(1, 'Name is required')
    .max(100, 'Name must be 100 characters or less')
    .regex(
      /^[a-z][a-z0-9_]*$/,
      'Name must start with a lowercase letter and contain only lowercase letters, numbers, and underscores'
    ),
  value: z.string()
    .min(1, 'Value is required'),
  description: z.string().max(500).nullish().transform(v => v ?? undefined),
});

export type CreateSecretDTO = z.infer<typeof createSecretSchema>;

export const updateSecretSchema = z.object({
  value: z.string().min(1, 'Value is required').optional(),
  description: z.string().max(500).nullish().transform(v => v ?? undefined),
}).refine(
  (data) => data.value !== undefined || data.description !== undefined,
  { message: 'At least one field must be provided' }
);

export type UpdateSecretDTO = z.infer<typeof updateSecretSchema>;

// ============================================================================
// QUERY SCHEMAS
// ============================================================================

export const listSecretsQuerySchema = z.object({
  search: z.string().max(255).nullish().transform(v => v ?? undefined),
});

export type ListSecretsQuery = z.infer<typeof listSecretsQuerySchema>;
