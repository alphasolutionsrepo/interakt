// app/search-indexes/_components/providers/azure-ai-search/azure-schema.ts

/**
 * Azure AI Search Provider — Zod Schema & Defaults
 *
 * Validation schema for Azure-specific index settings.
 */

import { z } from 'zod';

export const azureSettingsSchema = z.object({
    vectorSearchAlgorithm: z.enum(['hnsw', 'exhaustiveKnn']).default('hnsw'),
    hnswM: z.number().int().min(4).max(10).default(4),
    hnswEfConstruction: z.number().int().min(100).max(1000).default(400),
    hnswEfSearch: z.number().int().min(100).max(1000).default(500),
    semanticConfigName: z.string().default('default-semantic-config'),
});

export type AzureSettings = z.infer<typeof azureSettingsSchema>;

export const AZURE_DEFAULT_SETTINGS: Record<string, unknown> = {
    vectorSearchAlgorithm: 'hnsw',
    hnswM: 4,
    hnswEfConstruction: 400,
    hnswEfSearch: 500,
    semanticConfigName: 'default-semantic-config',
};
