// src/features/search/builders/query.builder.ts

/**
 * @deprecated This file has moved to ../providers/elasticsearch/query-builders/query.builder.ts
 * This re-export exists for backward compatibility only.
 */

export {
    buildSearchBody,
    buildLexicalSearchBody,
    buildSemanticSearchBody,
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
