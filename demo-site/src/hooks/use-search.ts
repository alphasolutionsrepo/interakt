'use client';

import { useState, useCallback, useMemo, useRef } from 'react';
import { useSettings } from '@/contexts/settings-context';
import { createApiClient } from '@/lib/api/client';
import type {
  SearchResult,
  Facet,
  Pagination,
  DisplayConfig,
} from '@/lib/api/types';

// ============================================================================
// TYPES
// ============================================================================

export interface UseSearchState {
  query: string;
  results: SearchResult[];
  facets: Facet[];
  pagination: Pagination | null;
  displayConfig: DisplayConfig | null;
  isLoading: boolean;
  error: Error | null;
  selectedFacets: Record<string, string[]>;
  took: number;
  indexesSearched: Array<{ id: string; name: string; displayName: string }>;
}

export interface UseSearchActions {
  search: (query: string) => Promise<void>;
  setPage: (page: number) => void;
  toggleFacet: (field: string, value: string) => void;
  clearFacets: () => void;
  reset: () => void;
}

export type UseSearchReturn = UseSearchState & UseSearchActions;

// ============================================================================
// INITIAL STATE
// ============================================================================

const initialState: Omit<UseSearchState, 'query'> = {
  results: [],
  facets: [],
  pagination: null,
  displayConfig: null,
  isLoading: false,
  error: null,
  selectedFacets: {},
  took: 0,
  indexesSearched: [],
};

// ============================================================================
// HOOK
// ============================================================================

export function useSearch(): UseSearchReturn {
  const { settings, isConfigured } = useSettings();
  const [state, setState] = useState<UseSearchState>({
    query: '',
    ...initialState,
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  const apiClient = useMemo(() => {
    if (!isConfigured) return null;
    return createApiClient(settings.apiUrl, settings.accessToken);
  }, [settings.apiUrl, settings.accessToken, isConfigured]);

  // =========================================================================
  // SEARCH
  // =========================================================================

  const performSearch = useCallback(async (
    query: string,
    page: number,
    facets: Record<string, string[]>
  ) => {
    if (!apiClient || !query.trim()) {
      setState((prev) => ({
        ...prev,
        query,
        results: [],
        pagination: null,
        isLoading: false,
      }));
      return;
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setState((prev) => ({
      ...prev,
      query,
      isLoading: true,
      error: null,
    }));

    try {
      // Build filters from selected facets
      const filters = Object.entries(facets).flatMap(([field, values]) =>
        values.map((value) => ({
          field,
          operator: 'eq' as const,
          value,
        }))
      );

      const response = await apiClient.search({
        query,
        page,
        // Don't hardcode pageSize - let the backend use the search experience's configured default
        filters: filters.length > 0 ? filters : undefined,
      });

      setState((prev) => ({
        ...prev,
        results: response.results,
        facets: response.facets || [],
        pagination: response.pagination,
        displayConfig: response.displayConfig || null,
        took: response.took,
        indexesSearched: response.indexesSearched || [],
        isLoading: false,
        error: null,
      }));
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return; // Ignore aborted requests
      }
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error : new Error('Search failed'),
      }));
    }
  }, [apiClient]);

  const search = useCallback(async (query: string) => {
    setState((prev) => ({
      ...prev,
      selectedFacets: {}, // Clear facets on new search
    }));
    await performSearch(query, 1, {});
  }, [performSearch]);

  // =========================================================================
  // PAGINATION
  // =========================================================================

  const setPage = useCallback((page: number) => {
    performSearch(state.query, page, state.selectedFacets);
  }, [performSearch, state.query, state.selectedFacets]);

  // =========================================================================
  // FACETS
  // =========================================================================

  const toggleFacet = useCallback((field: string, value: string) => {
    setState((prev) => {
      const currentValues = prev.selectedFacets[field] || [];
      const isSelected = currentValues.includes(value);

      const newValues = isSelected
        ? currentValues.filter((v) => v !== value)
        : [...currentValues, value];

      const newFacets = { ...prev.selectedFacets };
      if (newValues.length === 0) {
        delete newFacets[field];
      } else {
        newFacets[field] = newValues;
      }

      // Trigger search with new facets
      performSearch(prev.query, 1, newFacets);

      return {
        ...prev,
        selectedFacets: newFacets,
      };
    });
  }, [performSearch]);

  const clearFacets = useCallback(() => {
    setState((prev) => ({
      ...prev,
      selectedFacets: {},
    }));
    performSearch(state.query, 1, {});
  }, [performSearch, state.query]);

  // =========================================================================
  // RESET
  // =========================================================================

  const reset = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setState({
      query: '',
      ...initialState,
    });
  }, []);

  return {
    ...state,
    search,
    setPage,
    toggleFacet,
    clearFacets,
    reset,
  };
}
