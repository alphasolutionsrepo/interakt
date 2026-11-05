// app/playground/search/_lib/hooks/useSearchPlayground.ts

'use client';

/**
 * Search Playground Hooks
 *
 * Custom hooks for the search playground functionality.
 */

import { useState, useCallback } from 'react';
import useSWR from 'swr';

import { reportActionError } from '@/shared/activity/report';
import { handleApiResponse } from '@/shared/api/api-error';

// ============================================================================
// TYPES
// ============================================================================

export interface SearchIndex {
    id: string;
    name: string;
    displayName: string;
    description?: string;
    searchType: string;
    status: string;
    documentCount: number;
    isActive: boolean;
    dataTemplateId: string;
    dataTemplateName: string;
    createdAt: string;
    updatedAt: string;
}

export interface SearchContext {
    indexName: string;
    indexId: string;
    searchType: string;
    searchableFields: Array<{
        fieldName: string;
        fieldType: string;
        boostValue: number;
        analyzer?: string;
    }>;
    facetableFields: Array<{
        fieldName: string;
        fieldType: string;
        displayName?: string;
    }>;
    defaultResponseFields: string[];
    allFields: Record<string, {
        fieldName: string;
        fieldType: string;
        isSearchable: boolean;
        isFacetable: boolean;
        isIndexed: boolean;
        includeInResponse: boolean;
        boostValue: number;
    }>;
    language: string;
    embedding?: {
        dimensions: number;
        similarity: string;
        fieldName: string;
    };
    rrf?: {
        rankConstant: number;
        windowSize: number;
    };
}

export interface FilterClause {
    field: string;
    operator: string;
    value?: unknown;
    filters?: FilterClause[];
}

export interface FacetRequest {
    field: string;
    type: 'terms' | 'range' | 'date_range' | 'date_histogram' | 'histogram';
    size?: number;
    ranges?: Array<{ key?: string; from?: number | string; to?: number | string }>;
    interval?: string | number;
}

export interface SortClause {
    field: string;
    direction: 'asc' | 'desc';
    missing?: '_first' | '_last';
}

export interface SearchRequest {
    query: string;
    searchType?: 'lexical' | 'semantic' | 'hybrid' | 'auto';
    filters?: FilterClause[];
    facets?: FacetRequest[];
    page?: number;
    pageSize?: number;
    sort?: SortClause[];
    includeFields?: string[];
    excludeFields?: string[];
    highlight?: {
        fields?: string[];
        preTag?: string;
        postTag?: string;
        fragmentSize?: number;
        numberOfFragments?: number;
    };
    minScore?: number;
    explain?: boolean;
}

export interface SearchHit {
    id: string;
    score: number;
    source: Record<string, unknown>;
    highlights?: Record<string, string[]>;
    explanation?: string;
}

export interface FacetBucket {
    key: string | number;
    label?: string;
    count: number;
    from?: number | string;
    to?: number | string;
}

export interface FacetResult {
    field: string;
    type: string;
    buckets: FacetBucket[];
    missingCount?: number;
}

export interface SearchResponse {
    hits: SearchHit[];
    total: {
        value: number;
        relation: 'eq' | 'gte';
    };
    facets?: FacetResult[];
    took: number;
    maxScore?: number;
    pagination: {
        page: number;
        pageSize: number;
        totalPages: number;
        totalItems: number;
        hasNextPage: boolean;
        hasPreviousPage: boolean;
    };
    explanation?: {
        originalQuery: string;
        searchType: string;
        searchedFields: string[];
        appliedFilters: string[];
    };
}

// ============================================================================
// FETCHERS
// ============================================================================

const fetcher = async <T>(url: string) => handleApiResponse<T>(await fetch(url));

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Hook to fetch all active search indexes
 */
export function useSearchIndexes() {
    const { data, error, isLoading, mutate } = useSWR<SearchIndex[]>(
        '/api/search-indexes/all',
        fetcher<SearchIndex[]>
    );

    return {
        indexes: data || [],
        isLoading,
        error,
        refetch: mutate,
    };
}

/**
 * Hook to fetch search context for an index
 */
export function useSearchContext(indexId: string | null) {
    const { data, error, isLoading, mutate } = useSWR<SearchContext>(
        indexId ? `/api/search/index/${indexId}/context` : null,
        fetcher<SearchContext>
    );

    return {
        context: data || null,
        isLoading,
        error,
        refetch: mutate,
    };
}

/**
 * Search an index from the playground. A failed search throws an ApiError, which
 * carries what went wrong and what to try.
 */
export async function searchIndex(
    indexId: string,
    request: SearchRequest,
    options?: { trace?: boolean }
): Promise<SearchResponse> {
    const response = await fetch(`/api/search/index/${indexId}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        // Playground searches are untraced unless `trace` asks for a full trace
        body: JSON.stringify({ ...request, ...(options?.trace ? { trace: true } : {}) }),
    });
    return handleApiResponse<SearchResponse>(response, 'Search failed');
}

/**
 * Search a search experience from the playground, as its visitors would (the server
 * treats the admin session as a test). A failed search throws an ApiError.
 */
export async function searchExperience<T>(slug: string, body: Record<string, unknown>): Promise<T> {
    // Sent with the admin session, not the experience's access token, so the server
    // treats it as a test: not counted as real traffic, not traced unless asked.
    const response = await fetch(`/api/v1/search/${slug}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    return handleApiResponse<T>(response, 'Search failed');
}

/**
 * Hook to execute search
 */
export function useSearch() {
    const [isSearching, setIsSearching] = useState(false);
    const [searchResult, setSearchResult] = useState<SearchResponse | null>(null);
    /** What the failed search threw: an ApiError carries the hint and details */
    const [searchError, setSearchError] = useState<unknown>(null);

    const executeSearch = useCallback(async (
        indexId: string,
        request: SearchRequest,
        options?: { trace?: boolean }
    ): Promise<SearchResponse | null> => {
        setIsSearching(true);
        setSearchError(null);

        try {
            const data = await searchIndex(indexId, request, options);
            setSearchResult(data);
            return data;
        } catch (err) {
            // Shown in the results panel, so recorded without a notice
            reportActionError('Search', err, { inline: true });
            setSearchError(err);
            return null;
        } finally {
            setIsSearching(false);
        }
    }, []);

    const clearResults = useCallback(() => {
        setSearchResult(null);
        setSearchError(null);
    }, []);

    return {
        isSearching,
        searchResult,
        searchError,
        executeSearch,
        clearResults,
    };
}

/**
 * Hook to manage playground state
 */
export function usePlaygroundState() {
    const [selectedIndex, setSelectedIndex] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const [searchType, setSearchType] = useState<'lexical' | 'semantic' | 'hybrid' | 'auto'>('auto');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [filters, setFilters] = useState<FilterClause[]>([]);
    const [facets, setFacets] = useState<FacetRequest[]>([]);
    const [sort, setSort] = useState<SortClause[]>([]);
    const [enableHighlight, setEnableHighlight] = useState(true);
    const [enableExplain, setEnableExplain] = useState(false);

    const buildRequest = useCallback((): SearchRequest => {
        const request: SearchRequest = {
            query,
            searchType,
            page,
            pageSize,
        };

        if (filters.length > 0) {
            request.filters = filters;
        }

        if (facets.length > 0) {
            request.facets = facets;
        }

        if (sort.length > 0) {
            request.sort = sort;
        }

        if (enableHighlight) {
            request.highlight = {
                preTag: '<mark>',
                postTag: '</mark>',
                fragmentSize: 150,
                numberOfFragments: 3,
            };
        }

        if (enableExplain) {
            request.explain = true;
        }

        return request;
    }, [query, searchType, page, pageSize, filters, facets, sort, enableHighlight, enableExplain]);

    const reset = useCallback(() => {
        setQuery('');
        setSearchType('auto');
        setPage(1);
        setPageSize(20);
        setFilters([]);
        setFacets([]);
        setSort([]);
        setEnableHighlight(true);
        setEnableExplain(false);
    }, []);

    return {
        selectedIndex,
        setSelectedIndex,
        query,
        setQuery,
        searchType,
        setSearchType,
        page,
        setPage,
        pageSize,
        setPageSize,
        filters,
        setFilters,
        facets,
        setFacets,
        sort,
        setSort,
        enableHighlight,
        setEnableHighlight,
        enableExplain,
        setEnableExplain,
        buildRequest,
        reset,
    };
}

/**
 * Hook for managing filter builder
 */
export function useFilterBuilder(initialFilters: FilterClause[] = []) {
    const [filters, setFilters] = useState<FilterClause[]>(initialFilters);

    const addFilter = useCallback((filter: FilterClause) => {
        setFilters(prev => [...prev, filter]);
    }, []);

    const removeFilter = useCallback((index: number) => {
        setFilters(prev => prev.filter((_, i) => i !== index));
    }, []);

    const updateFilter = useCallback((index: number, filter: FilterClause) => {
        setFilters(prev => prev.map((f, i) => i === index ? filter : f));
    }, []);

    const clearFilters = useCallback(() => {
        setFilters([]);
    }, []);

    return {
        filters,
        setFilters,
        addFilter,
        removeFilter,
        updateFilter,
        clearFilters,
    };
}

/**
 * Hook for managing facet builder
 */
export function useFacetBuilder(initialFacets: FacetRequest[] = []) {
    const [facets, setFacets] = useState<FacetRequest[]>(initialFacets);

    const addFacet = useCallback((facet: FacetRequest) => {
        setFacets(prev => [...prev, facet]);
    }, []);

    const removeFacet = useCallback((index: number) => {
        setFacets(prev => prev.filter((_, i) => i !== index));
    }, []);

    const updateFacet = useCallback((index: number, facet: FacetRequest) => {
        setFacets(prev => prev.map((f, i) => i === index ? facet : f));
    }, []);

    const clearFacets = useCallback(() => {
        setFacets([]);
    }, []);

    return {
        facets,
        setFacets,
        addFacet,
        removeFacet,
        updateFacet,
        clearFacets,
    };
}
