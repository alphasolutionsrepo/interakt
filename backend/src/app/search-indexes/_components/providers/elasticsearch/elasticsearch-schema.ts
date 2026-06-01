// app/search-indexes/_components/providers/elasticsearch/elasticsearch-schema.ts

/**
 * Elasticsearch Provider — Zod Schema & Defaults
 *
 * Validation schema for ES-specific index settings.
 * Used by the wizard and edit page for client-side validation.
 */

import { z } from 'zod';

export const elasticsearchSettingsSchema = z.object({
    numberOfShards: z.number().int().min(1).max(100).default(1),
    numberOfReplicas: z.number().int().min(0).max(10).default(0),
    refreshInterval: z.string().default('1s'),
});

export type ElasticsearchSettings = z.infer<typeof elasticsearchSettingsSchema>;

export const ELASTICSEARCH_DEFAULT_SETTINGS: Record<string, unknown> = {
    numberOfShards: 1,
    numberOfReplicas: 0,
    refreshInterval: '1s',
};
