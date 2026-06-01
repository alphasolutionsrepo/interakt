// src/features/search/providers/elasticsearch/elasticsearch-search.provider.ts

/**
 * Elasticsearch Search Provider
 *
 * Implements SearchProvider interface for Elasticsearch backend.
 * Handles all search types: lexical, semantic, and hybrid.
 *
 * For hybrid search, uses custom RRF implementation instead of ES native RRF
 * (which requires Platinum/Enterprise license).
 */

import 'server-only';

import { getElasticsearchClient } from './elasticsearch.client';
import { createLogger } from '@/shared/logger/logger';
import type {
    ProviderSearchRequest,
    ProviderSearchResponse,
    ProviderHit,
    TotalHits,
} from '../../search.types';
import { SearchError } from '../../search.types';
import type {
    SearchProvider,
    DistinctValuesOptions,
    DistinctValuesResult,
    AutocompleteOptions,
    AutocompleteResult,
} from '../search-provider.interface';
import type { GetDocumentResult } from '../search-engine-provider.interface';
import {
    buildSearchBody,
    buildLexicalSearchBody,
    buildSemanticSearchBody,
    type ESSearchBody,
} from './query-builders';
import {
    fuseSearchResults,
    createRRFConfig,
    type RRFConfig,
} from '../../hybrid-fusion';

const logger = createLogger('elasticsearch-search-provider');

// Dedicated logger for ES query debugging (async, non-blocking)
const esQueryLogger = createLogger('es-query');

// ============================================================================
// LOGGING CONFIGURATION
// ============================================================================

/**
 * Check if detailed ES logging is enabled
 * Set LOG_ES_QUERIES=true to enable detailed query/response logging
 */
const ES_QUERY_LOGGING_ENABLED = process.env.LOG_ES_QUERIES === 'true';

/**
 * Maximum size for logging query/response bodies (to prevent huge logs)
 */
const MAX_LOG_BODY_SIZE = 10000;

/**
 * Truncate large objects for logging
 */
function truncateForLog(obj: unknown, maxSize: number = MAX_LOG_BODY_SIZE): string {
    const str = JSON.stringify(obj);
    if (str.length <= maxSize) {
        return str;
    }
    return str.substring(0, maxSize) + `... [truncated, total: ${str.length} chars]`;
}

// ============================================================================
// ELASTICSEARCH SEARCH PROVIDER
// ============================================================================

/**
 * Elasticsearch implementation of SearchProvider
 */
export class ElasticsearchSearchProvider implements SearchProvider {
    readonly name = 'elasticsearch';
    readonly supportedSearchTypes = ['lexical', 'semantic', 'hybrid'] as const;

    /**
     * Execute search against Elasticsearch
     */
    async search(request: ProviderSearchRequest): Promise<ProviderSearchResponse> {
        const { context, request: searchRequest, searchType, queryEmbedding, timeoutMs } = request;

        // Log search context for debugging field configuration issues (async, non-blocking)
        if (ES_QUERY_LOGGING_ENABLED) {
            esQueryLogger.debug('Search context', {
                index: context.indexName,
                searchType,
                query: searchRequest.query,
                searchableFields: context.searchableFields.map(f => ({
                    name: f.fieldName,
                    type: f.fieldType,
                    boost: f.boostValue,
                })),
                responseFields: context.defaultResponseFields,
                facetableFields: context.facetableFields.map(f => f.fieldName),
                embeddingField: context.embedding?.fieldName,
            });
        }

        logger.debug('Executing search', {
            indexName: context.indexName,
            searchType,
            query: searchRequest.query,
            hasEmbedding: !!queryEmbedding,
            searchableFieldCount: context.searchableFields.length,
            responseFieldCount: context.defaultResponseFields.length,
        });

        try {
            // For hybrid search, use custom implementation
            if (searchType === 'hybrid') {
                if (!queryEmbedding || !context.embedding) {
                    throw new Error('Hybrid search requires embedding configuration and query vector');
                }
                return await this.executeCustomHybridSearch(request);
            }

            // For lexical and semantic, use standard approach
            const searchBody = buildSearchBody(
                searchRequest,
                context,
                searchType,
                queryEmbedding
            );

            const result = await this.executeSearch(context.indexName, searchBody, timeoutMs);

            logger.debug('Search completed', {
                indexName: context.indexName,
                took: result.took,
                totalHits: result.total.value,
                hitsReturned: result.hits.length,
            });

            return result;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';

            logger.error('Search execution failed', {
                indexName: context.indexName,
                searchType,
                error: errorMessage,
            });

            if (error instanceof SearchError) {
                throw error;
            }

            throw new SearchError(
                errorMessage,
                'PROVIDER_ERROR',
                { provider: this.name, indexName: context.indexName }
            );
        }
    }

    /**
     * Check if the provider is healthy
     */
    async isHealthy(): Promise<boolean> {
        try {
            const es = getElasticsearchClient();
            const health = await es.cluster.health();
            return health.status !== 'red';
        } catch {
            return false;
        }
    }

    // ========================================================================
    // AUTOCOMPLETE
    // ========================================================================

    /**
     * Execute an autocomplete/suggestion query against Elasticsearch.
     *
     * Uses multi_match with bool_prefix type for edge-ngram style matching.
     * Falls back to phrase_prefix if no custom analyzer is specified.
     */
    async autocomplete(
        indexName: string,
        query: string,
        fields: string[],
        options?: AutocompleteOptions
    ): Promise<AutocompleteResult> {
        const es = getElasticsearchClient();
        const maxSuggestions = options?.maxSuggestions ?? 16;
        const preTag = options?.highlightPreTag ?? '<mark>';
        const postTag = options?.highlightPostTag ?? '</mark>';

        const highlightFields: Record<string, Record<string, unknown>> = {};
        for (const field of fields) {
            highlightFields[field] = {
                pre_tags: [preTag],
                post_tags: [postTag],
                number_of_fragments: 1,
                fragment_size: 100,
            };
        }

        // Build the query — use bool_prefix if an analyzer is specified, otherwise phrase_prefix
        const matchType = options?.analyzer ? 'bool_prefix' : 'phrase_prefix';
        const queryBody: Record<string, unknown> = {
            multi_match: {
                query: query.trim(),
                fields,
                type: matchType,
                operator: 'and',
                ...(options?.analyzer ? { analyzer: options.analyzer } : {}),
            },
        };

        try {
            const response = await es.search({
                index: indexName,
                size: maxSuggestions,
                _source: fields,
                query: queryBody,
                highlight: { fields: highlightFields },
            } as Parameters<typeof es.search>[0]);

            const hits = (response.hits?.hits ?? []).map(hit => ({
                id: hit._id,
                score: hit._score ?? 0,
                source: (hit._source as Record<string, unknown>) ?? {},
                highlights: hit.highlight as Record<string, string[]> | undefined,
            }));

            return { hits };
        } catch (error) {
            logger.error('Autocomplete query failed', {
                indexName,
                query,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            return { hits: [] };
        }
    }

    // ========================================================================
    // GET DOCUMENT
    // ========================================================================

    /**
     * Get a single document by ID with optional field filtering.
     */
    async getDocument(
        indexName: string,
        documentId: string,
        sourceFields?: string[]
    ): Promise<GetDocumentResult> {
        try {
            const es = getElasticsearchClient();
            const response = await es.get({
                index: indexName,
                id: documentId,
                _source: sourceFields && sourceFields.length > 0 ? sourceFields : true,
            });

            if (!response.found) {
                return { found: false };
            }

            return {
                found: true,
                id: response._id,
                source: response._source as Record<string, unknown>,
            };
        } catch (error) {
            // Handle 404 — document not found
            if (error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 404) {
                return { found: false };
            }

            const message = error instanceof Error ? error.message : 'Failed to get document';
            logger.error('Failed to get document by ID', { indexName, documentId, error: message });
            return { found: false, error: message };
        }
    }

    // ========================================================================
    // DISTINCT VALUES (for auto-generating filter canonicals)
    // ========================================================================

    /**
     * Get distinct values for a field using ES terms aggregation.
     *
     * Handles field type differences:
     * - Text fields aggregate via .keyword subfield
     * - Keyword/numeric/boolean fields aggregate directly
     */
    async getDistinctValues(
        indexName: string,
        fieldName: string,
        options?: DistinctValuesOptions
    ): Promise<DistinctValuesResult> {
        const es = getElasticsearchClient();
        const maxValues = options?.maxValues ?? 200;
        const minDocCount = options?.minDocCount ?? 1;

        logger.debug('Fetching distinct values', {
            indexName,
            fieldName,
            maxValues,
            minDocCount,
        });

        try {
            // First, get the field mapping to determine the correct aggregation field
            const aggField = await this.resolveAggregationField(indexName, fieldName);

            const response = await es.search({
                index: indexName,
                size: 0, // We only want the aggregation, not documents
                body: {
                    aggs: {
                        distinct_values: {
                            terms: {
                                field: aggField,
                                size: maxValues,
                                min_doc_count: minDocCount,
                                order: { _count: 'desc' },
                            },
                        },
                    },
                },
            } as Parameters<typeof es.search>[0]);

            // Parse the aggregation response
            const aggs = response.aggregations as Record<string, unknown> | undefined;
            const termsAgg = aggs?.distinct_values as {
                buckets: Array<{ key: string | number | boolean; doc_count: number }>;
                sum_other_doc_count?: number;
            } | undefined;

            const buckets = termsAgg?.buckets ?? [];
            const sumOther = termsAgg?.sum_other_doc_count ?? 0;

            const values = buckets.map(bucket => ({
                value: String(bucket.key),
                count: bucket.doc_count,
            }));

            logger.debug('Distinct values retrieved', {
                indexName,
                fieldName,
                valuesReturned: values.length,
                totalDistinct: values.length + (sumOther > 0 ? 1 : 0),
            });

            return {
                fieldName,
                values,
                totalDistinct: values.length + (sumOther > 0 ? sumOther : 0),
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error('Failed to fetch distinct values', {
                indexName,
                fieldName,
                error: errorMessage,
            });

            throw new SearchError(
                `Failed to fetch distinct values for field "${fieldName}": ${errorMessage}`,
                'PROVIDER_ERROR',
                { provider: this.name, indexName, fieldName }
            );
        }
    }

    /**
     * Resolve the correct field path for aggregation.
     * Text fields need .keyword subfield; keyword/numeric types aggregate directly.
     */
    private async resolveAggregationField(indexName: string, fieldName: string): Promise<string> {
        try {
            const es = getElasticsearchClient();
            const mappingResponse = await es.indices.getFieldMapping({
                index: indexName,
                fields: fieldName,
            });

            // Extract field mapping
            const indexMapping = Object.values(mappingResponse)[0] as {
                mappings?: Record<string, { mapping?: Record<string, { type?: string }> }>;
            } | undefined;

            const fieldMapping = indexMapping?.mappings?.[fieldName]?.mapping;
            const fieldType = fieldMapping ? Object.values(fieldMapping)[0]?.type : undefined;

            // Text fields need .keyword subfield for aggregation
            if (fieldType === 'text') {
                return `${fieldName}.keyword`;
            }

            return fieldName;
        } catch {
            // If we can't determine the type, try with field name directly
            logger.warn('Could not determine field type for aggregation, using field name directly', {
                indexName,
                fieldName,
            });
            return fieldName;
        }
    }

    // ========================================================================
    // CUSTOM HYBRID SEARCH
    // ========================================================================

    /**
     * Execute custom hybrid search using parallel lexical + semantic queries
     * and custom RRF fusion algorithm
     */
    private async executeCustomHybridSearch(
        request: ProviderSearchRequest
    ): Promise<ProviderSearchResponse> {
        const { context, request: searchRequest, queryEmbedding, hybridConfigOverride, timeoutMs } = request;
        const startTime = Date.now();

        if (!queryEmbedding || !context.embedding) {
            throw new Error('Hybrid search requires embedding configuration and query vector');
        }

        logger.debug('Executing custom hybrid search', {
            indexName: context.indexName,
            query: searchRequest.query,
            hasHybridOverride: !!hybridConfigOverride,
        });

        // Build separate queries for lexical and semantic search
        const lexicalBody = buildLexicalSearchBody(searchRequest, context);
        const semanticBody = buildSemanticSearchBody(searchRequest, context, queryEmbedding);

        // Execute both searches in parallel
        const [lexicalResult, semanticResult] = await Promise.all([
            this.executeSearch(context.indexName, lexicalBody, timeoutMs),
            this.executeSearch(context.indexName, semanticBody, timeoutMs),
        ]);

        logger.debug('Hybrid search queries completed', {
            indexName: context.indexName,
            lexicalHits: lexicalResult.hits.length,
            semanticHits: semanticResult.hits.length,
            lexicalTook: lexicalResult.took,
            semanticTook: semanticResult.took,
        });

        // Create RRF config from Search Experience hybridConfig
        const rrfConfig: RRFConfig = createRRFConfig({
            rankConstant: hybridConfigOverride?.rrfRankConstant ?? 60,
            windowSize: hybridConfigOverride?.rrfWindowSize ?? 100,
            lexicalWeight: hybridConfigOverride?.lexicalWeight ?? 1.0,
            semanticWeight: hybridConfigOverride?.semanticWeight ?? 1.0,
        });

        // Fuse results using custom RRF algorithm
        const fusedResult = fuseSearchResults({
            lexicalHits: lexicalResult.hits,
            lexicalTotal: lexicalResult.total,
            semanticHits: semanticResult.hits,
            semanticTotal: semanticResult.total,
            config: rrfConfig,
            page: searchRequest.page || 1,
            pageSize: searchRequest.pageSize || 20,
        });

        const totalTime = Date.now() - startTime;

        logger.info('Custom hybrid search completed', {
            indexName: context.indexName,
            totalTime,
            lexicalHits: fusedResult.fusionInfo?.lexicalCount,
            semanticHits: fusedResult.fusionInfo?.semanticCount,
            mergedHits: fusedResult.fusionInfo?.mergedCount,
            overlappingDocs: fusedResult.fusionInfo?.overlappingDocs,
            returnedHits: fusedResult.hits.length,
        });

        return {
            hits: fusedResult.hits,
            total: fusedResult.total,
            aggregations: lexicalResult.aggregations,
            took: totalTime,
            maxScore: fusedResult.maxScore,
        };
    }

    // ========================================================================
    // PRIVATE METHODS
    // ========================================================================

    /**
     * Execute the actual Elasticsearch search request
     */
    private async executeSearch(
        indexName: string,
        searchBody: ESSearchBody,
        timeoutMs?: number
    ): Promise<ProviderSearchResponse> {
        const es = getElasticsearchClient();
        const startTime = Date.now();

        const searchParams: Record<string, unknown> = {
            index: indexName,
            ...searchBody,
        };

        if (timeoutMs) {
            searchParams.timeout = `${timeoutMs}ms`;
        }

        // Log the outgoing ES query (async, non-blocking)
        if (ES_QUERY_LOGGING_ENABLED) {
            esQueryLogger.debug('ES request', {
                index: indexName,
                body: truncateForLog(searchBody),
            });
        }

        logger.debug('ES query', {
            index: indexName,
            hasQuery: !!searchBody.query,
            hasKnn: !!searchBody.knn,
            from: searchBody.from,
            size: searchBody.size,
            hasFilters: !!searchBody.query && 'bool' in searchBody.query && !!(searchBody.query as { bool?: { filter?: unknown } }).bool?.filter,
            hasAggs: !!searchBody.aggs,
            hasHighlight: !!searchBody.highlight,
        });

        try {
            const response = await es.search(searchParams as Parameters<typeof es.search>[0]);

            const took = Date.now() - startTime;

            // Parse hits
            const hits = this.parseHits(response.hits?.hits || []);

            // Parse total
            const total = this.parseTotal(response.hits?.total);

            // Parse max score
            const maxScore = typeof response.hits?.max_score === 'number'
                ? response.hits.max_score
                : undefined;

            // Log the ES response (async, non-blocking)
            if (ES_QUERY_LOGGING_ENABLED) {
                esQueryLogger.debug('ES response', {
                    index: indexName,
                    tookEs: response.took,
                    tookTotal: took,
                    totalHits: total.value,
                    totalRelation: total.relation,
                    returnedHits: hits.length,
                    maxScore,
                    firstHitId: hits[0]?.id,
                    firstHitScore: hits[0]?.score,
                    firstHitSourceFields: hits[0] ? Object.keys(hits[0].source) : [],
                    aggregations: response.aggregations ? Object.keys(response.aggregations) : [],
                });
            }

            logger.debug('ES response', {
                index: indexName,
                tookEs: response.took,
                tookTotal: took,
                totalHits: total.value,
                totalRelation: total.relation,
                returnedHits: hits.length,
                maxScore,
                hasAggregations: !!response.aggregations,
            });

            return {
                hits,
                total,
                aggregations: response.aggregations as Record<string, unknown> | undefined,
                took,
                maxScore,
            };
        } catch (error) {
            const took = Date.now() - startTime;

            if (ES_QUERY_LOGGING_ENABLED) {
                esQueryLogger.error('ES query failed', {
                    index: indexName,
                    took,
                    error: error instanceof Error ? error.message : 'Unknown error',
                    query: truncateForLog(searchBody),
                });
            }

            logger.error('ES query failed', {
                index: indexName,
                took,
                error: error instanceof Error ? error.message : 'Unknown error',
                errorType: this.isIndexNotFoundError(error) ? 'INDEX_NOT_FOUND' :
                           this.isSearchPhaseExecutionError(error) ? 'SEARCH_PHASE_ERROR' : 'UNKNOWN',
            });

            if (this.isIndexNotFoundError(error)) {
                throw new SearchError(
                    `Index "${indexName}" not found`,
                    'INDEX_NOT_FOUND',
                    { indexName }
                );
            }

            if (this.isSearchPhaseExecutionError(error)) {
                throw new SearchError(
                    this.extractSearchError(error),
                    'INVALID_QUERY',
                    { indexName }
                );
            }

            throw error;
        }
    }

    /**
     * Parse Elasticsearch hits into provider hits
     */
    private parseHits(esHits: unknown[]): ProviderHit[] {
        return esHits.map(hit => {
            const typedHit = hit as {
                _id: string;
                _score: number | null;
                _source?: Record<string, unknown>;
                highlight?: Record<string, string[]>;
                _explanation?: unknown;
            };

            return {
                id: typedHit._id,
                score: typedHit._score ?? 0,
                source: typedHit._source || {},
                highlight: typedHit.highlight,
                explanation: typedHit._explanation,
            };
        });
    }

    /**
     * Parse Elasticsearch total hits
     */
    private parseTotal(esTotal: unknown): TotalHits {
        if (!esTotal) {
            return { value: 0, relation: 'eq' };
        }

        if (typeof esTotal === 'number') {
            return { value: esTotal, relation: 'eq' };
        }

        const total = esTotal as { value: number; relation: string };
        return {
            value: total.value,
            relation: total.relation === 'gte' ? 'gte' : 'eq',
        };
    }

    /**
     * Check if error is index not found
     */
    private isIndexNotFoundError(error: unknown): boolean {
        if (!error || typeof error !== 'object') return false;
        const meta = (error as { meta?: { statusCode?: number } }).meta;
        return meta?.statusCode === 404;
    }

    /**
     * Check if error is search phase execution error
     */
    private isSearchPhaseExecutionError(error: unknown): boolean {
        if (!error || typeof error !== 'object') return false;
        const message = (error as { message?: string }).message || '';
        return message.includes('search_phase_execution_exception');
    }

    /**
     * Extract meaningful error message from Elasticsearch error
     */
    private extractSearchError(error: unknown): string {
        if (!error || typeof error !== 'object') return 'Search failed';

        const body = (error as { body?: { error?: { root_cause?: Array<{ reason?: string }> } } }).body;
        const rootCause = body?.error?.root_cause?.[0];
        if (rootCause?.reason) {
            return rootCause.reason;
        }

        const message = (error as { message?: string }).message;
        return message || 'Search failed';
    }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let providerInstance: ElasticsearchSearchProvider | null = null;

/**
 * Get the Elasticsearch search provider instance
 */
export function getElasticsearchSearchProvider(): ElasticsearchSearchProvider {
    if (!providerInstance) {
        providerInstance = new ElasticsearchSearchProvider();
    }
    return providerInstance;
}
