// app/playground/search/_lib/hooks/useSearchPlayground.ts

'use client';

/**
 * Search Playground Hooks
 *
 * Custom hooks for the search playground functionality.
 */

import { useState, useCallback } from 'react';
import useSWR from 'swr';

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

const fetcher = async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) {
        const error = await res.json().catch(() => ({ message: 'Request failed' }));
        throw new Error(error.message || 'Request failed');
    }
    return res.json();
};

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Hook to fetch all active search indexes
 */
export function useSearchIndexes() {
    const { data, error, isLoading, mutate } = useSWR<{ data: SearchIndex[] }>(
        '/api/search-indexes/all',
        fetcher
    );

    return {
        indexes: data?.data || [],
        isLoading,
        error,
        refetch: mutate,
    };
}

/**
 * Hook to fetch search context for an index
 */
export function useSearchContext(indexId: string | null) {
    const { data, error, isLoading, mutate } = useSWR<{ data: SearchContext }>(
        indexId ? `/api/search/index/${indexId}/context` : null,
        fetcher
    );

    return {
        context: data?.data || null,
        isLoading,
        error,
        refetch: mutate,
    };
}

/**
 * Hook to execute search
 */
export function useSearch() {
    const [isSearching, setIsSearching] = useState(false);
    const [searchResult, setSearchResult] = useState<SearchResponse | null>(null);
    const [searchError, setSearchError] = useState<string | null>(null);

    const executeSearch = useCallback(async (
        indexId: string,
        request: SearchRequest
    ): Promise<SearchResponse | null> => {
        setIsSearching(true);
        setSearchError(null);

        try {
            const response = await fetch(`/api/search/index/${indexId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(request),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Search failed');
            }

            setSearchResult(data.data);
            return data.data;
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Search failed';
            setSearchError(message);
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
