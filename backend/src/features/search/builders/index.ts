// src/features/search/builders/index.ts

/**
 * Backward-compatible re-export.
 *
 * The implementation has moved to ../providers/elasticsearch/query-builders/
 * This file exists to prevent import breakage during the migration.
 *
 * @deprecated Import from '@/features/search/providers/elasticsearch/query-builders' instead.
 */

// Filter builder
export {
    buildFilterQuery,
    type ESQuery,
    type ESBoolQuery,
    type ESRangeQuery,
} from '../providers/elasticsearch/query-builders/filter.builder';

// Query builder
export {
    buildSearchBody,
    // Standalone builders for custom hybrid search
    buildLexicalSearchBody,
    buildSemanticSearchBody,
    // Types
    type ESSearchBody,
    type ESKnnQuery,
    type ESRankQuery,
    type ESSortClause,
    type ESSortOptions,
    type ESSourceConfig,
    type ESHighlightConfig,
    type ESHighlightFieldConfig,
    type ESAggregation,
    type ESTermsAggregation,
    type ESRangeAggregation,
    type ESDateRangeAggregation,
    type ESDateHistogramAggregation,
    type ESHistogramAggregation,
} from '../providers/elasticsearch/query-builders/query.builder';
