// src/features/ingestion-keys/ingestion-key.validation.ts

/**
 * Ingestion Key Validation
 */

import { z } from 'zod';
import { INGESTION_OPERATIONS } from '@/db/schema/ingestion-keys.schema';

export const ingestionOperationSchema = z.enum(INGESTION_OPERATIONS);

/**
 * Schema for creating an ingestion key.
 *
 * At least one operation is required: a key that can do nothing is a
 * configuration mistake, not a useful read-only credential — reads are already
 * covered by being scoped to the index.
 */
export const createIngestionKeyRequestSchema = z.object({
    name: z.string().min(1).max(255),
    operations: z.array(ingestionOperationSchema).min(1),
    /**
     * Additional indexes this key may act on, beyond the one in the route.
     * Omit for the common single-index case.
     */
    additionalSearchIndexIds: z.array(z.string().uuid()).optional(),
    /** ISO date. Omit for a key that does not expire on its own. */
    expiresAt: z.string().datetime().optional(),
});

export type CreateIngestionKeyRequest = z.infer<typeof createIngestionKeyRequestSchema>;

/**
 * Schema for the key id path param.
 */
export const ingestionKeyIdParamSchema = z.object({
    keyId: z.string().uuid(),
});

export type IngestionKeyIdParam = z.infer<typeof ingestionKeyIdParamSchema>;
