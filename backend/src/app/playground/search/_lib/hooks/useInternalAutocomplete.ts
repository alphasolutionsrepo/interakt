// app/playground/search/_lib/hooks/useInternalAutocomplete.ts

/**
 * useInternalAutocomplete Hook
 *
 * React hook for autocomplete using internal API (without access token).
 * Used by the Search Playground for direct index testing.
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// ============================================================================
// TYPES
// ============================================================================

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

export interface UseInternalAutocompleteOptions {
    /** Search index ID */
    indexId: string | null;
    /** Minimum characters before triggering suggestions (default: 2) */
    minLength?: number;
    /** Maximum suggestions to request (default: 8) */
    maxSuggestions?: number;
    /** Debounce delay in ms (default: 150) */
    debounceMs?: number;
    /** Callback when suggestion is selected */
    onSelect?: (suggestion: AutocompleteSuggestion) => void;
    /** Enable/disable the hook (default: true) */
    enabled?: boolean;
}

export interface UseInternalAutocompleteReturn {
    /** Current suggestions */
    suggestions: AutocompleteSuggestion[];
    /** Whether suggestions are loading */
    isLoading: boolean;
    /** Error message if any */
    error: string | null;
    /** Current query value */
    query: string;
    /** Set the query value */
    setQuery: (query: string) => void;
    /** Clear suggestions */
    clearSuggestions: () => void;
    /** Select a suggestion */
    selectSuggestion: (suggestion: AutocompleteSuggestion) => void;
    /** Whether suggestions are visible */
    showSuggestions: boolean;
    /** Hide suggestions */
    hideSuggestions: () => void;
    /** Time taken for last request (ms) */
    took: number | null;
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

export function useInternalAutocomplete(
    options: UseInternalAutocompleteOptions
): UseInternalAutocompleteReturn {
    const {
        indexId,
        minLength = 2,
        maxSuggestions = 8,
        debounceMs = 150,
        onSelect,
        enabled = true,
    } = options;

    // State
    const [query, setQuery] = useState('');
    const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [took, setTook] = useState<number | null>(null);

    // Refs for cleanup and tracking
    const abortControllerRef = useRef<AbortController | null>(null);
    const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

    // Clear suggestions
    const clearSuggestions = useCallback(() => {
        setSuggestions([]);
        setShowSuggestions(false);
        setError(null);
    }, []);

    // Hide suggestions without clearing them
    const hideSuggestions = useCallback(() => {
        setShowSuggestions(false);
    }, []);

    // Select a suggestion
    const selectSuggestion = useCallback(
        (suggestion: AutocompleteSuggestion) => {
            setQuery(suggestion.text);
            setShowSuggestions(false);
            onSelect?.(suggestion);
        },
        [onSelect]
    );

    // Fetch suggestions from API
    const fetchSuggestions = useCallback(
        async (searchQuery: string) => {
            // Cancel any pending request
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }

            // Don't fetch if no index selected or query is too short
            if (!indexId || searchQuery.length < minLength) {
                clearSuggestions();
                return;
            }

            // Create new abort controller
            abortControllerRef.current = new AbortController();
            setIsLoading(true);
            setError(null);

            try {
                // Attach .catch() immediately (before await) so the AbortError rejection
                // is handled synchronously in the microtask queue, preventing Next.js
                // Turbopack's global unhandled-rejection handler from intercepting it.
                const response = await fetch(`/api/search/index/${indexId}/autocomplete`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        query: searchQuery,
                        maxSuggestions,
                    }),
                    signal: abortControllerRef.current.signal,
                }).catch((err: unknown) => {
                    if ((err as Error)?.name === 'AbortError') return null;
                    throw err;
                });

                // null means the request was aborted — bail out silently
                if (!response) return;

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.error || errorData.message || `HTTP ${response.status}`);
                }

                const data = await response.json();

                if (data.success && data.data) {
                    const result = data.data as AutocompleteResponse;
                    setSuggestions(result.suggestions);
                    setTook(result.took);
                    setShowSuggestions(result.suggestions.length > 0);
                } else {
                    throw new Error(data.error || 'Invalid response');
                }
            } catch (err) {
                // Ignore abort errors (belt-and-suspenders — caught above, but keep for safety)
                if (
                    (err instanceof Error && err.name === 'AbortError') ||
                    (err instanceof DOMException && err.name === 'AbortError')
                ) {
                    return;
                }

                const errorMessage = err instanceof Error ? err.message : 'Failed to fetch suggestions';
                setError(errorMessage);
                setSuggestions([]);
                setShowSuggestions(false);
            } finally {
                setIsLoading(false);
            }
        },
        [indexId, minLength, maxSuggestions, clearSuggestions]
    );

    // Debounced fetch effect
    useEffect(() => {
        // Skip if disabled or no index
        if (!enabled || !indexId) {
            clearSuggestions();
            return;
        }

        // Clear any pending debounce timer
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
        }

        // If query is too short, clear immediately
        if (query.length < minLength) {
            clearSuggestions();
            return;
        }

        // Debounce the API call
        debounceTimerRef.current = setTimeout(() => {
            fetchSuggestions(query).catch(() => {});
        }, debounceMs);

        // Cleanup
        return () => {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }
        };
    }, [query, indexId, minLength, debounceMs, enabled, fetchSuggestions, clearSuggestions]);

    // Clear when index changes
    useEffect(() => {
        clearSuggestions();
    }, [indexId, clearSuggestions]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }
        };
    }, []);

    return {
        suggestions,
        isLoading,
        error,
        query,
        setQuery,
        clearSuggestions,
        selectSuggestion,
        showSuggestions,
        hideSuggestions,
        took,
    };
}

export default useInternalAutocomplete;
