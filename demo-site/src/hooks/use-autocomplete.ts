'use client';

import { useState, useCallback, useRef, useMemo } from 'react';
import { useSettings } from '@/contexts/settings-context';
import { createApiClient } from '@/lib/api/client';
import type { AutocompleteSuggestion } from '@/lib/api/types';

// ============================================================================
// TYPES
// ============================================================================

export interface UseAutocompleteReturn {
  suggestions: AutocompleteSuggestion[];
  isLoading: boolean;
  error: Error | null;
  fetchSuggestions: (query: string) => void;
  clearSuggestions: () => void;
}

// ============================================================================
// HOOK
// ============================================================================

export function useAutocomplete(debounceMs: number = 150): UseAutocompleteReturn {
  const { settings, isConfigured } = useSettings();
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const apiClient = useMemo(() => {
    if (!isConfigured) return null;
    return createApiClient(settings.apiUrl, settings.accessToken);
  }, [settings.apiUrl, settings.accessToken, isConfigured]);

  const fetchSuggestions = useCallback((query: string) => {
    // Clear existing debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Clear suggestions if query is too short
    if (!query.trim() || query.trim().length < 2) {
      setSuggestions([]);
      setIsLoading(false);
      return;
    }

    if (!apiClient) {
      return;
    }

    // Debounce the request
    debounceTimerRef.current = setTimeout(async () => {
      // Cancel previous request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      setIsLoading(true);
      setError(null);

      try {
        const response = await apiClient.autocomplete({
          query: query.trim(),
          limit: 8,
        });

        setSuggestions(response.suggestions || []);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return; // Ignore aborted requests
        }
        setError(err instanceof Error ? err : new Error('Autocomplete failed'));
        setSuggestions([]);
      } finally {
        setIsLoading(false);
      }
    }, debounceMs);
  }, [apiClient, debounceMs]);

  const clearSuggestions = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setSuggestions([]);
    setError(null);
  }, []);

  return {
    suggestions,
    isLoading,
    error,
    fetchSuggestions,
    clearSuggestions,
  };
}
