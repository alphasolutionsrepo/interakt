// src/features/search/search.service.ts

/**
 * Search Service
 *
 * Main entry point for search operations. Orchestrates:
 * - Index lookup (via search-index service with caching)
 * - Context building
 * - Provider selection
 * - Query execution
 * - Response normalization
 */

import 'server-only';

import { AsyncLocalStorage } from 'node:async_hooks';
import { createLogger } from '@/shared/logger/logger';
import type { SearchType } from '@/shared/constants/search-index.constants';
import type { SearchIndexComplete } from '@/features/search-index';
import * as searchIndexService from '@/features/search-index/search-index.service';
import { generateEmbedding } from '@/features/ai-service';
import { trackSearch, type TriggerType } from '@/features/analytics';
import { ATTR } from '@/features/telemetry';
import { traceSearch } from './search.tracing';
import type {
    SearchRequest,
    SearchResponse,
    SearchContext,
    SearchIndexIdentifier,
    ProviderSearchRequest,
} from './search.types';
import { SearchError } from './search.types';
import { searchRequestSchema } from './search.validation';
import { buildSearchContext, supportsSemanticSearch } from './search-context.builder';
import {
    providerRegistry,
    initializeSearchProviders,
    type SearchProvider,
} from './providers';
import { normalizeSearchResponse } from './response.normalizer';

const logger = createLogger('search-service');

// ============================================================================
// PROVIDER RESOLUTION
// ============================================================================

/**
 * Ensure search providers are initialized.
 * Handles cases where instrumentation.ts runs in a different module context
 * (common with Next.js Turbopack).
 */
function ensureProvidersInitialized(): void {
    if (providerRegistry.list().length === 0) {
        logger.info('Provider registry empty, initializing lazily');
        initializeSearchProviders();
    }
}

/**
 * Resolve the SearchProvider for a given search context.
 *
 * Lazily initializes providers if the registry is empty (handles Next.js
 * multi-context module evaluation).
 */
function resolveSearchProvider(context: SearchContext): SearchProvider {
    ensureProvidersInitialized();

    const providerName = context.searchProvider ?? 'elasticsearch';
    const provider = providerRegistry.get(providerName);

    if (provider) return provider;

    throw new SearchError(
        `Search provider "${providerName}" is not registered. Ensure providers are initialized at startup.`,
        'PROVIDER_ERROR',
        { provider: providerName }
    );
}

// ============================================================================
// TYPES
// ============================================================================

/**
 * Hybrid search configuration override (from Search Experience)
 */
export interface HybridConfigOverride {
    /** Weight for lexical results (0.1-3.0, default 1.0) */
    lexicalWeight?: number;
    /** Weight for semantic results (0.1-3.0, default 1.0) */
    semanticWeight?: number;
    /** RRF rank constant (k) - higher reduces impact of high-ranked docs */
    rrfRankConstant?: number;
    /** Window size - how many results to consider from each source */
    rrfWindowSize?: number;
}

/**
 * Extended search request with analytics context
 */
export interface SearchOptions {
    /** Session ID from frontend for analytics */
    sessionId?: string;
    /** How the search was triggered */
    triggerType?: TriggerType;
    /** Source ID if triggered by AI (e.g., chat message ID) */
    triggerSourceId?: string;
    /** AI request ID if triggered by AI tool */
    aiRequestId?: string;
    /** Experience ID if searching via search experience */
    experienceId?: string;
    /** Experience slug */
    experienceSlug?: string;
    /** Where the request originated: 'api', 'playground', 'admin_test' */
    source?: 'api' | 'playground' | 'admin_test';
    /** Hybrid search config override from Search Experience */
    hybridConfig?: HybridConfigOverride;
    /** Search timeout in milliseconds */
    timeoutMs?: number;
}

// ============================================================================
// ANALYTICS SOURCE CONTEXT (request-scoped via AsyncLocalStorage)
// ============================================================================

type AnalyticsSourceType = 'api' | 'playground' | 'admin_test';

const analyticsSourceStore = new AsyncLocalStorage<AnalyticsSourceType>();
const experienceContextStore = new AsyncLocalStorage<{ experienceId: string; experienceSlug?: string }>();

/**
 * Run a function with a specific analytics source context.
 * All search operations within this context will be tagged with the given source.
 * Used by the pipeline to propagate source without threading through every layer.
 */
export function withAnalyticsSource<T>(source: AnalyticsSourceType, fn: () => T): T {
    return analyticsSourceStore.run(source, fn);
}

/**
 * Run a function with an experience context.
 * All search operations within this context will be tagged with the given experience ID.
 * Used by the pipeline to propagate experienceId without threading through every layer.
 */
export function withExperienceContext<T>(experienceId: string, fn: () => T, experienceSlug?: string): T {
    return experienceContextStore.run({ experienceId, experienceSlug }, fn);
}

/**
 * Get the current experience context (if any).
 * Used by external search executors to tag analytics events.
 */
export function getExperienceContext(): { experienceId: string; experienceSlug?: string } | undefined {
    return experienceContextStore.getStore();
}

function getAnalyticsSource(options?: SearchOptions): AnalyticsSourceType {
    return options?.source ?? analyticsSourceStore.getStore() ?? 'api';
}

// ============================================================================
// MAIN SEARCH FUNCTION
// ============================================================================

/**
 * Execute a search query against an index
 *
 * @param identifier - Index identifier (id or name)
 * @param request - Search request with query, filters, facets, etc.
 * @param options - Optional analytics and context options
 * @returns Normalized search response
 */
export async function search(
    identifier: SearchIndexIdentifier,
    request: SearchRequest,
    options?: SearchOptions
): Promise<SearchResponse> {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    let searchIndex: SearchIndexComplete | null = null;
    let searchType: SearchType = 'lexical';
    let embeddingDurationMs: number | undefined;

    try {
        // 1. Validate request - parse throws on invalid input
        const validatedRequest = searchRequestSchema.parse(request) as SearchRequest;

        // 2. Get search index (uses cached service)
        searchIndex = await resolveSearchIndex(identifier);

        // 3. Build search context
        const context = buildSearchContext(searchIndex);

        // 4. Determine effective search type
        searchType = resolveSearchType(validatedRequest, context);

        // 5–8. Execute search within OTel span
        const response = await traceSearch(
            {
                experienceId: options?.experienceId,
                query: validatedRequest.query,
                searchType,
                indexName: context.indexName,
                triggerType: options?.triggerType,
            },
            async (span) => {
                // 5. Generate query embedding if needed
                const embeddingStartTime = Date.now();
                const queryEmbedding = await getQueryEmbedding(
                    validatedRequest.query,
                    searchType,
                    context,
                    searchIndex!
                );
                if (queryEmbedding) {
                    embeddingDurationMs = Date.now() - embeddingStartTime;
                }

                // 6. Build provider request
                const providerRequest: ProviderSearchRequest = {
                    context,
                    request: validatedRequest,
                    searchType,
                    queryEmbedding,
                    hybridConfigOverride: options?.hybridConfig,
                    timeoutMs: options?.timeoutMs,
                };

                // 7. Execute search via provider
                const provider = resolveSearchProvider(context);
                const providerResponse = await provider.search(providerRequest);

                // 8. Normalize response
                const normalized = normalizeSearchResponse(
                    providerResponse,
                    validatedRequest,
                    context,
                    searchType
                );

                // Record results on span
                span.setAttribute(ATTR.SEARCH_TOTAL_RESULTS, normalized.total.value);
                span.setAttribute(ATTR.SEARCH_RETURNED, normalized.hits.length);
                span.setAttribute(ATTR.SEARCH_INDEX_ID, searchIndex!.id);
                span.setAttribute(ATTR.SEARCH_PROVIDER, context.searchProvider ?? 'elasticsearch');
                if (normalized.took) {
                    span.setAttribute(ATTR.SEARCH_ES_TOOK_MS, normalized.took);
                }
                span.setAttribute(ATTR.SEARCH_HAS_FILTERS, !!(validatedRequest.filters && validatedRequest.filters.length > 0));

                return normalized;
            }
        );

        const durationMs = Date.now() - startTime;

        logger.info('Search completed', {
            indexName: context.indexName,
            query: validatedRequest.query.substring(0, 50),
            searchType,
            totalHits: response.total.value,
            took: durationMs,
        });

        // Fire-and-forget analytics tracking
        trackSearch({
            requestId,
            sessionId: options?.sessionId,
            source: getAnalyticsSource(options),
            triggerType: options?.triggerType ?? 'user',
            triggerSourceId: options?.triggerSourceId,
            aiRequestId: options?.aiRequestId,
            searchType,
            indexIds: [searchIndex.id],
            experienceId: options?.experienceId ?? experienceContextStore.getStore()?.experienceId,
            experienceSlug: options?.experienceSlug ?? experienceContextStore.getStore()?.experienceSlug,
            queryText: validatedRequest.query,
            hasFilters: validatedRequest.filters && validatedRequest.filters.length > 0,
            filterFields: extractFilterFields(validatedRequest.filters),
            filterCount: countFilters(validatedRequest.filters),
            facetsRequested: validatedRequest.facets?.map(f => f.field),
            totalResults: response.total.value,
            resultsReturned: response.hits.length,
            pageNumber: validatedRequest.page ?? 1,
            topResultScore: response.hits[0]?.score,
            durationMs,
            esTookMs: response.took,
            embeddingDurationMs,
            success: true,
        });

        return response;
    } catch (error) {
        const durationMs = Date.now() - startTime;

        logger.error('Search failed', {
            identifier,
            query: request.query?.substring(0, 50),
            error: error instanceof Error ? error.message : 'Unknown error',
        });

        // Fire-and-forget analytics tracking for failures
        trackSearch({
            requestId,
            sessionId: options?.sessionId,
            source: getAnalyticsSource(options),
            triggerType: options?.triggerType ?? 'user',
            triggerSourceId: options?.triggerSourceId,
            aiRequestId: options?.aiRequestId,
            searchType,
            indexIds: searchIndex ? [searchIndex.id] : [],
            experienceId: options?.experienceId ?? experienceContextStore.getStore()?.experienceId,
            experienceSlug: options?.experienceSlug ?? experienceContextStore.getStore()?.experienceSlug,
            queryText: request.query ?? '',
            hasFilters: request.filters && request.filters.length > 0,
            filterCount: countFilters(request.filters),
            totalResults: 0,
            resultsReturned: 0,
            pageNumber: request.page ?? 1,
            durationMs,
            embeddingDurationMs,
            success: false,
            errorCode: error instanceof SearchError ? error.code : 'UNKNOWN_ERROR',
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
        });

        if (error instanceof SearchError) {
            throw error;
        }

        throw new SearchError(
            error instanceof Error ? error.message : 'Search failed',
            'PROVIDER_ERROR',
            { identifier }
        );
    }
}

/**
 * Extract filter field names from filters array
 */
function extractFilterFields(filters?: unknown[]): string[] | undefined {
    if (!filters || filters.length === 0) return undefined;

    const fields: string[] = [];

    function extractFromClause(clause: unknown) {
        if (!clause || typeof clause !== 'object') return;
        const c = clause as Record<string, unknown>;

        if (c.field && typeof c.field === 'string' && !['and', 'or', 'not'].includes(c.field)) {
            fields.push(c.field);
        }

        if (Array.isArray(c.filters)) {
            for (const nested of c.filters) {
                extractFromClause(nested);
            }
        }
    }

    for (const filter of filters) {
        extractFromClause(filter);
    }

    return fields.length > 0 ? [...new Set(fields)] : undefined;
}

/**
 * Count total filter conditions
 */
function countFilters(filters?: unknown[]): number {
    if (!filters || filters.length === 0) return 0;

    let count = 0;

    function countFromClause(clause: unknown) {
        if (!clause || typeof clause !== 'object') return;
        const c = clause as Record<string, unknown>;

        if (c.field && typeof c.field === 'string' && !['and', 'or', 'not'].includes(c.field)) {
            count++;
        }

        if (Array.isArray(c.filters)) {
            for (const nested of c.filters) {
                countFromClause(nested);
            }
        }
    }

    for (const filter of filters) {
        countFromClause(filter);
    }

    return count;
}

/**
 * Search by index ID
 */
export async function searchById(
    indexId: string,
    request: SearchRequest,
    options?: SearchOptions
): Promise<SearchResponse> {
    return search({ id: indexId }, request, options);
}

/**
 * Search by index name
 */
export async function searchByName(
    indexName: string,
    request: SearchRequest,
    options?: SearchOptions
): Promise<SearchResponse> {
    return search({ name: indexName }, request, options);
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Resolve search index from identifier
 */
async function resolveSearchIndex(
    identifier: SearchIndexIdentifier
): Promise<SearchIndexComplete> {
    let searchIndex: SearchIndexComplete | null = null;

    if (identifier.id) {
        searchIndex = await searchIndexService.getSearchIndexById(identifier.id);
    } else if (identifier.name) {
        searchIndex = await searchIndexService.getSearchIndexByName(identifier.name);
    }

    if (!searchIndex) {
        throw new SearchError(
            `Search index not found: ${identifier.id || identifier.name}`,
            'INDEX_NOT_FOUND',
            { identifier }
        );
    }

    // Check if index is active
    if (!searchIndex.isActive) {
        throw new SearchError(
            `Search index "${searchIndex.name}" is not active`,
            'INDEX_NOT_READY',
            { indexName: searchIndex.name }
        );
    }

    // Check if index is ready for search
    // Valid statuses: 'ready' (initial), 'active' (operational), 'indexing' (being indexed)
    const validStatuses = ['ready', 'active', 'indexing'];
    if (!validStatuses.includes(searchIndex.status)) {
        throw new SearchError(
            `Search index "${searchIndex.name}" is not ready (status: ${searchIndex.status})`,
            'INDEX_NOT_READY',
            { indexName: searchIndex.name, status: searchIndex.status }
        );
    }

    return searchIndex;
}

/**
 * Resolve effective search type
 */
function resolveSearchType(
    request: SearchRequest,
    context: SearchContext
): SearchType {
    // If request specifies a type, validate and use it
    if (request.searchType && request.searchType !== 'auto') {
        const requestedType = request.searchType as SearchType;

        // Validate semantic/hybrid requires embedding config
        if ((requestedType === 'semantic' || requestedType === 'hybrid') &&
            !supportsSemanticSearch(context)) {
            logger.warn('Requested semantic search but index lacks AI config, falling back to lexical', {
                indexName: context.indexName,
                requestedType,
            });
            return 'lexical';
        }

        return requestedType;
    }

    // Use index's configured search type
    return context.searchType;
}

/**
 * Generate query embedding if needed for semantic/hybrid search
 */
async function getQueryEmbedding(
    query: string,
    searchType: SearchType,
    context: SearchContext,
    searchIndex: SearchIndexComplete
): Promise<number[] | undefined> {
    // Only needed for semantic or hybrid search
    if (searchType !== 'semantic' && searchType !== 'hybrid') {
        return undefined;
    }

    // Ensure we have AI configuration
    if (!context.embedding || !searchIndex.aiProviderId || !searchIndex.aiModelId) {
        throw new SearchError(
            'Semantic search requires AI configuration',
            'EMBEDDING_FAILED',
            { indexName: context.indexName }
        );
    }

    try {
        // generateEmbedding returns number[] directly
        const embedding = await generateEmbedding(query, {
            providerId: searchIndex.aiProviderId,
            modelId: searchIndex.aiModelId,
            feature: 'search_query',
        });

        return embedding;
    } catch (error) {
        logger.error('Failed to generate query embedding', {
            indexName: context.indexName,
            error: error instanceof Error ? error.message : 'Unknown error',
        });

        throw new SearchError(
            'Failed to generate query embedding',
            'EMBEDDING_FAILED',
            { indexName: context.indexName }
        );
    }
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validate filter fields exist in index
 */
export function validateFilters(
    request: SearchRequest,
    context: SearchContext
): { valid: boolean; errors: string[] } {
    if (!request.filters || request.filters.length === 0) {
        return { valid: true, errors: [] };
    }

    const errors: string[] = [];

    function validateFilterClause(clause: { field: string; filters?: unknown[] }) {
        // Skip boolean operators
        if (clause.field && !['and', 'or', 'not'].includes(clause.field)) {
            const field = context.allFields.get(clause.field);
            if (!field) {
                errors.push(`Unknown filter field: ${clause.field}`);
            } else if (!field.isIndexed) {
                errors.push(`Field not indexed: ${clause.field}`);
            }
        }

        // Recursively validate nested filters
        if (Array.isArray(clause.filters)) {
            for (const nested of clause.filters) {
                if (typeof nested === 'object' && nested !== null) {
                    validateFilterClause(nested as { field: string; filters?: unknown[] });
                }
            }
        }
    }

    for (const filter of request.filters) {
        validateFilterClause(filter as { field: string; filters?: unknown[] });
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Validate facet fields exist and are facetable
 */
export function validateFacets(
    request: SearchRequest,
    context: SearchContext
): { valid: boolean; errors: string[] } {
    if (!request.facets || request.facets.length === 0) {
        return { valid: true, errors: [] };
    }

    const errors: string[] = [];

    for (const facet of request.facets) {
        const field = context.allFields.get(facet.field);
        if (!field) {
            errors.push(`Unknown facet field: ${facet.field}`);
        } else if (!field.isFacetable) {
            errors.push(`Field not facetable: ${facet.field}`);
        }
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Validate sort fields exist
 */
export function validateSort(
    request: SearchRequest,
    context: SearchContext
): { valid: boolean; errors: string[] } {
    if (!request.sort || request.sort.length === 0) {
        return { valid: true, errors: [] };
    }

    const errors: string[] = [];

    for (const sort of request.sort) {
        // Allow _score as special field
        if (sort.field === '_score') {
            continue;
        }

        const field = context.allFields.get(sort.field);
        if (!field) {
            errors.push(`Unknown sort field: ${sort.field}`);
        } else if (field.fieldType === 'text') {
            errors.push(`Cannot sort on text field: ${sort.field}`);
        }
    }

    return { valid: errors.length === 0, errors };
}

// ============================================================================
// UTILITY EXPORTS
// ============================================================================

/**
 * Get search context for an index (useful for UI to show available fields)
 */
export async function getSearchContext(
    identifier: SearchIndexIdentifier
): Promise<SearchContext> {
    const searchIndex = await resolveSearchIndex(identifier);
    return buildSearchContext(searchIndex);
}

/**
 * Check if search service is healthy
 */
export async function checkHealth(): Promise<boolean> {
    const provider = providerRegistry.getDefault();
    if (!provider) {
        throw new SearchError('No search provider registered', 'PROVIDER_ERROR');
    }
    return provider.isHealthy();
}

// ============================================================================
// AUTOCOMPLETE
// ============================================================================

export interface AutocompleteRequest {
    query: string;
    maxSuggestions?: number;
}

export interface AutocompleteSuggestion {
    text: string;
    score: number;
    field: string;
    indexId: string;
    indexName: string;
    highlight?: string;
}

export interface AutocompleteResponse {
    suggestions: AutocompleteSuggestion[];
    query: string;
    took: number;
}

/**
 * Get autocomplete suggestions for an index
 */
export async function autocomplete(
    identifier: SearchIndexIdentifier,
    request: AutocompleteRequest
): Promise<AutocompleteResponse> {
    const startTime = Date.now();
    const { query, maxSuggestions = 8 } = request;

    // Validate query
    if (!query || query.trim().length < 2) {
        return { suggestions: [], query, took: 0 };
    }

    try {
        // Get search index
        const searchIndex = await resolveSearchIndex(identifier);
        const context = buildSearchContext(searchIndex);

        // Find autocomplete fields
        const autocompleteFields = searchIndex.fields
            .filter(f => f.isAutocomplete && f.isSearchable)
            .map(f => f.fieldName);

        if (autocompleteFields.length === 0) {
            logger.debug('No autocomplete fields configured', { indexName: context.indexName });
            return { suggestions: [], query, took: Date.now() - startTime };
        }

        // Execute autocomplete via search provider (resolved from context)
        const provider = resolveSearchProvider(context);
        const autocompleteResult = await provider.autocomplete!(
            context.indexName,
            query.trim(),
            autocompleteFields,
            { maxSuggestions: maxSuggestions * 2 } // Get extra to dedupe
        );

        // Extract unique suggestions from hits
        const seen = new Set<string>();
        const suggestions: AutocompleteSuggestion[] = [];

        for (const hit of autocompleteResult.hits) {
            if (suggestions.length >= maxSuggestions) break;

            // Check each autocomplete field
            for (const field of autocompleteFields) {
                if (suggestions.length >= maxSuggestions) break;

                const value = hit.source[field];
                if (typeof value !== 'string' || !value.trim()) continue;

                // Dedupe by lowercase text
                const normalizedText = value.trim().toLowerCase();
                if (seen.has(normalizedText)) continue;
                seen.add(normalizedText);

                suggestions.push({
                    text: value.trim(),
                    score: hit.score,
                    field,
                    indexId: searchIndex.id,
                    indexName: searchIndex.displayName || searchIndex.name,
                    highlight: hit.highlights?.[field]?.[0],
                });
            }
        }

        logger.debug('Autocomplete completed', {
            indexName: context.indexName,
            query: query.substring(0, 20),
            suggestions: suggestions.length,
            took: Date.now() - startTime,
        });

        return {
            suggestions,
            query,
            took: Date.now() - startTime,
        };
    } catch (error) {
        logger.error('Autocomplete failed', {
            identifier,
            query: query.substring(0, 20),
            error: error instanceof Error ? error.message : 'Unknown error',
        });

        throw new SearchError(
            error instanceof Error ? error.message : 'Autocomplete failed',
            'PROVIDER_ERROR',
            { identifier }
        );
    }
}

/**
 * Get autocomplete by index ID
 */
export async function autocompleteById(
    indexId: string,
    request: AutocompleteRequest
): Promise<AutocompleteResponse> {
    return autocomplete({ id: indexId }, request);
}

/**
 * Get autocomplete by index name
 */
export async function autocompleteByName(
    indexName: string,
    request: AutocompleteRequest
): Promise<AutocompleteResponse> {
    return autocomplete({ name: indexName }, request);
}

// ============================================================================
// GET DOCUMENT BY ID
// ============================================================================

export interface GetDocumentResponse {
    id: string;
    fields: Record<string, unknown>;
    indexId: string;
    indexName: string;
}

/**
 * Get a single document by ID from an index
 * Respects field configurations (only returns fields with includeInResponse: true)
 */
export async function getDocumentById(
    identifier: SearchIndexIdentifier,
    documentId: string
): Promise<GetDocumentResponse | null> {
    try {
        // Get search index
        const searchIndex = await resolveSearchIndex(identifier);
        const context = buildSearchContext(searchIndex);

        // Build _source filter from fields with includeInResponse
        const sourceFields = context.defaultResponseFields;

        // Get document via search provider (resolved from context)
        const provider = resolveSearchProvider(context);
        const result = await provider.getDocument!(
            context.indexName,
            documentId,
            sourceFields.length > 0 ? sourceFields : undefined
        );

        if (!result.found) {
            if (result.error) {
                throw new Error(result.error);
            }
            return null;
        }

        return {
            id: result.id!,
            fields: result.source ?? {},
            indexId: searchIndex.id,
            indexName: searchIndex.name,
        };
    } catch (error) {
        logger.error('Failed to get document by ID', {
            identifier,
            documentId,
            error: error instanceof Error ? error.message : 'Unknown error',
        });

        if (error instanceof SearchError) {
            throw error;
        }

        throw new SearchError(
            error instanceof Error ? error.message : 'Failed to get document',
            'PROVIDER_ERROR',
            { identifier, documentId }
        );
    }
}

/**
 * Get document by ID from index ID
 */
export async function getDocumentByIdFromIndex(
    indexId: string,
    documentId: string
): Promise<GetDocumentResponse | null> {
    return getDocumentById({ id: indexId }, documentId);
}

/**
 * Get document by ID from index name
 */
export async function getDocumentByIdFromIndexName(
    indexName: string,
    documentId: string
): Promise<GetDocumentResponse | null> {
    return getDocumentById({ name: indexName }, documentId);
}
