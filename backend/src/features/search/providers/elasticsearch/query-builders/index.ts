// src/features/search/providers/elasticsearch/query-builders/index.ts

/**
 * Elasticsearch Query Builders - Public API
 *
 * ES-specific query DSL builders for search, filtering, and aggregations.
 */

// Filter builder
export {
    buildFilterQuery,
    type ESQuery,
    type ESBoolQuery,
    type ESRangeQuery,
} from './filter.builder';

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
} from './query.builder';
