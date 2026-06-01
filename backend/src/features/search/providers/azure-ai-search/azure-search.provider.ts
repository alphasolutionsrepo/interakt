// src/features/search/providers/azure-ai-search/azure-search.provider.ts

/**
 * Azure AI Search Provider
 *
 * Implements SearchProvider interface for Azure AI Search.
 * Uses Azure's native hybrid search (built-in RRF) — no custom fusion needed.
 *
 * All search types (lexical, semantic, hybrid) go through a single search() call.
 * Azure handles fusion, reranking, and vector search internally.
 */

import 'server-only';

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
    AutocompleteOptions,
    AutocompleteResult,
    DistinctValuesOptions,
    DistinctValuesResult,
} from '../search-provider.interface';
import type { GetDocumentResult } from '../search-engine-provider.interface';
import { getSearchClient, checkAzureHealth } from './azure-client';
import { buildAzureSearchOptions, type AzureSearchOptions } from './query-builders';

const logger = createLogger('azure-search-provider');

/**
 * Detect Azure failures caused by an invalid $orderby clause — either a malformed
 * sort expression or a field that isn't sortable in the index. Such failures should
 * degrade to relevance ranking rather than failing the entire search.
 */
function isOrderByError(error: unknown): boolean {
    const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
    return (
        message.includes('$orderby') ||
        message.includes('orderby') ||
        message.includes('sort expression') ||
        message.includes('not sortable')
    );
}

// ============================================================================
// AZURE AI SEARCH PROVIDER
// ============================================================================

export class AzureSearchProvider implements SearchProvider {
    readonly name = 'azure-ai-search';

    /**
     * Execute search against Azure AI Search.
     *
     * Azure handles all search types in a single request:
     * - Lexical: searchText only
     * - Semantic: searchText + queryType: 'semantic'
     * - Hybrid: searchText + vectorQueries + queryType: 'semantic' (native RRF)
     */
    async search(request: ProviderSearchRequest): Promise<ProviderSearchResponse> {
        const { context, request: searchRequest, searchType, queryEmbedding } = request;
        const startTime = Date.now();

        logger.debug('Executing Azure search', {
            indexName: context.indexName,
            searchType,
            query: searchRequest.query,
            hasEmbedding: !!queryEmbedding,
        });

        const client = getSearchClient(context.indexName);
        const searchOptions = buildAzureSearchOptions(request);

        // Execute a single Azure search call and collect the response.
        const runSearch = async (options: AzureSearchOptions): Promise<ProviderSearchResponse> => {
            // Azure SDK search() returns an async iterable
            const response = await client.search(options.searchText, {
                ...options,
                searchText: undefined, // Already passed as first arg
            });

            // Collect results
            const hits: ProviderHit[] = [];
            for await (const result of response.results) {
                const doc = result.document as Record<string, unknown>;
                const docId = (doc.id as string) || '';
                const { id: _id, ...source } = doc;

                hits.push({
                    id: docId,
                    score: result.score ?? 0,
                    source,
                    highlight: result.highlights
                        ? Object.fromEntries(
                            Object.entries(result.highlights).map(([k, v]) => [k, v as string[]])
                        )
                        : undefined,
                });
            }

            const took = Date.now() - startTime;
            const totalCount = response.count ?? hits.length;

            const total: TotalHits = {
                value: totalCount,
                relation: 'eq',
            };

            // Extract facet results
            const aggregations = response.facets
                ? this.transformFacets(response.facets)
                : undefined;

            logger.debug('Azure search completed', {
                indexName: context.indexName,
                took,
                totalHits: totalCount,
                hitsReturned: hits.length,
            });

            return {
                hits,
                total,
                aggregations,
                took,
                maxScore: hits.length > 0 ? Math.max(...hits.map(h => h.score)) : undefined,
            };
        };

        try {
            try {
                return await runSearch(searchOptions);
            } catch (error) {
                // A bad $orderby (malformed expression or a non-sortable field, often
                // from AI-generated sort arguments) should not fail the whole search.
                // Drop the sort and retry once so results degrade to relevance ranking.
                if (searchOptions.orderBy?.length && isOrderByError(error)) {
                    logger.warn('Azure search orderBy rejected — retrying without sort', {
                        indexName: context.indexName,
                        orderBy: searchOptions.orderBy,
                        error: error instanceof Error ? error.message : String(error),
                    });
                    return await runSearch({ ...searchOptions, orderBy: undefined });
                }
                throw error;
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error('Azure search failed', {
                indexName: context.indexName,
                searchType,
                error: errorMessage,
            });

            if (error instanceof SearchError) {
                throw error;
            }

            throw new SearchError(errorMessage, 'PROVIDER_ERROR', {
                provider: 'azure-ai-search',
                indexName: context.indexName,
            });
        }
    }

    /**
     * Check if Azure AI Search is healthy.
     */
    async isHealthy(): Promise<boolean> {
        const result = await checkAzureHealth();
        return result.healthy;
    }

    /**
     * Autocomplete — uses Azure's native suggest API with a pre-configured suggester.
     *
     * The suggester (named 'sg') must be defined at index creation time via
     * buildIndexSettings() in azure-engine.provider.ts. It uses analyzingInfixMatching
     * for partial term matching.
     *
     * We use suggest() (not autocomplete()) because suggest returns full document
     * fields + highlights, which matches our autocomplete UX better than
     * autocomplete() which only returns completed terms.
     */
    async autocomplete(
        indexName: string,
        query: string,
        fields: string[],
        options?: AutocompleteOptions
    ): Promise<AutocompleteResult> {
        const maxSuggestions = options?.maxSuggestions ?? 16;
        const preTag = options?.highlightPreTag ?? '<mark>';
        const postTag = options?.highlightPostTag ?? '</mark>';

        try {
            const client = getSearchClient(indexName);

            // Azure suggest API: uses the pre-configured suggester 'sg'
            const response = await client.suggest(query, 'sg', {
                searchFields: fields,
                select: ['id', ...fields],
                top: maxSuggestions,
                highlightPreTag: preTag,
                highlightPostTag: postTag,
            });

            const hits: AutocompleteResult['hits'] = [];
            for await (const result of response.results) {
                const doc = result.document as Record<string, unknown>;
                hits.push({
                    id: (doc.id as string) || '',
                    score: 1, // Suggest API doesn't return scores
                    source: doc,
                    highlights: result.text
                        ? this.extractSuggestHighlights(result.text, fields)
                        : undefined,
                });
            }

            return { hits };
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Autocomplete failed';

            // Suggester not configured on this index — expected for indexes created before
            // the suggester was added. Fall back gracefully to search-based autocomplete.
            if (message.includes('suggester') || message.includes('No suggester')) {
                logger.warn('Azure suggest API unavailable (no suggester configured), falling back to search-based autocomplete', { indexName });
                return this.autocompleteViaSearch(indexName, query, fields, options);
            }

            logger.error('Azure autocomplete failed', { service: 'azure-search-provider', indexName, query: query.substring(0, 20), error: message });
            return { hits: [] };
        }
    }

    /**
     * Fallback autocomplete using regular search (for indexes without a suggester).
     */
    private async autocompleteViaSearch(
        indexName: string,
        query: string,
        fields: string[],
        options?: AutocompleteOptions
    ): Promise<AutocompleteResult> {
        const maxSuggestions = options?.maxSuggestions ?? 16;
        const preTag = options?.highlightPreTag ?? '<mark>';
        const postTag = options?.highlightPostTag ?? '</mark>';

        try {
            const client = getSearchClient(indexName);

            const response = await client.search(query, {
                searchFields: fields,
                select: ['id', ...fields],
                top: maxSuggestions,
                highlightFields: fields.join(','),
                highlightPreTag: preTag,
                highlightPostTag: postTag,
            });

            const hits: AutocompleteResult['hits'] = [];
            for await (const result of response.results) {
                const doc = result.document as Record<string, unknown>;
                hits.push({
                    id: (doc.id as string) || '',
                    score: result.score ?? 0,
                    source: doc,
                    highlights: result.highlights
                        ? Object.fromEntries(
                            Object.entries(result.highlights).map(([k, v]) => [k, v as string[]])
                        )
                        : undefined,
                });
            }

            return { hits };
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Search-based autocomplete failed';
            logger.error('Azure search-based autocomplete failed', { indexName, error: message });
            return { hits: [] };
        }
    }

    /**
     * Extract highlight-like structure from Azure suggest result text.
     * The suggest API returns a single `text` string with highlight tags embedded.
     */
    private extractSuggestHighlights(
        text: string,
        fields: string[]
    ): Record<string, string[]> | undefined {
        if (!text) return undefined;
        // Azure suggest returns highlighted text — map it to the first field
        const field = fields[0];
        if (!field) return undefined;
        return { [field]: [text] };
    }

    /**
     * Get a single document by ID.
     */
    async getDocument(
        indexName: string,
        documentId: string,
        sourceFields?: string[]
    ): Promise<GetDocumentResult> {
        try {
            const client = getSearchClient(indexName);
            const options = sourceFields ? { selectedFields: sourceFields } : {};
            const doc = await client.getDocument(documentId, options);

            if (!doc) {
                return { found: false };
            }

            const { id: _id, ...source } = doc as Record<string, unknown>;
            return {
                found: true,
                id: documentId,
                source,
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Get document failed';
            logger.error('Azure getDocument failed', { indexName, documentId, error: message });
            return { found: false, error: message };
        }
    }

    /**
     * Get distinct values for a field (using facets).
     */
    async getDistinctValues(
        indexName: string,
        fieldName: string,
        options?: DistinctValuesOptions
    ): Promise<DistinctValuesResult> {
        try {
            const client = getSearchClient(indexName);
            const maxValues = options?.maxValues ?? 500;

            const response = await client.search('*', {
                top: 0,
                facets: [`${fieldName},count:${maxValues}`],
                includeTotalCount: true,
            });

            const facetResult = response.facets?.[fieldName] ?? [];
            const values = (facetResult as Array<{ value: string; count: number }>).map(
                (f: any) => ({
                    value: String(f.value),
                    count: f.count ?? 0,
                })
            );

            return {
                fieldName,
                values,
                totalDistinct: values.length,
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to get distinct values';
            logger.error('Azure getDistinctValues failed', { indexName, fieldName, error: message });
            return { fieldName, values: [], totalDistinct: 0 };
        }
    }

    /**
     * Transform Azure facet results to the aggregation format expected by the response normalizer.
     */
    private transformFacets(facets: Record<string, unknown>): Record<string, unknown> {
        const result: Record<string, unknown> = {};

        for (const [fieldName, facetValues] of Object.entries(facets)) {
            if (Array.isArray(facetValues)) {
                // Use facet_ prefix to match the key format expected by response normalizer
                result[`facet_${fieldName}`] = {
                    buckets: facetValues.map((fv: any) => ({
                        key: fv.value,
                        doc_count: fv.count,
                    })),
                };
            }
        }

        return result;
    }
}
