// src/features/search/providers/elasticsearch-search.provider.ts

/**
 * Backward-compatible re-export.
 *
 * The implementation has moved to ./elasticsearch/elasticsearch-search.provider.ts
 * This file exists to prevent import breakage during the migration.
 */

export {
    ElasticsearchSearchProvider,
    getElasticsearchSearchProvider,
} from './elasticsearch/elasticsearch-search.provider';
