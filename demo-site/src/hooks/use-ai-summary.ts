'use client';

import { useState, useCallback, useRef } from 'react';
import { useSettings } from '@/contexts/settings-context';
import { createApiClient } from '@/lib/api/client';
import type { SearchResult } from '@/lib/api/types';

// ============================================================================
// TYPES
// ============================================================================

export interface UseAISummaryState {
  summary: string;
  followUpQueries: string[];
  isStreaming: boolean;
  isComplete: boolean;
  isCollapsed: boolean;
  error: Error | null;
}

export interface UseAISummaryActions {
  generate: (query: string, results: SearchResult[]) => void;
  abort: () => void;
  reset: () => void;
  toggleCollapsed: () => void;
}

export type UseAISummaryReturn = UseAISummaryState & UseAISummaryActions & {
  shouldShow: boolean;
};

// ============================================================================
// HOOK
// ============================================================================

export function useAISummary(): UseAISummaryReturn {
  const { settings, isConfigured } = useSettings();
  const [state, setState] = useState<UseAISummaryState>({
    summary: '',
    followUpQueries: [],
    isStreaming: false,
    isComplete: false,
    isCollapsed: false,
    error: null,
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  // =========================================================================
  // GENERATE
  // =========================================================================

  const generate = useCallback((query: string, results: SearchResult[]) => {
    if (!isConfigured || results.length < 3) {
      return; // Only show summary for 3+ results
    }

    // Abort previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setState({
      summary: '',
      followUpQueries: [],
      isStreaming: true,
      isComplete: false,
      isCollapsed: false,
      error: null,
    });

    const apiClient = createApiClient(settings.apiUrl, settings.accessToken);

    // Prepare results for summarization
    const summarizeResults = results.slice(0, 10).map((r) => ({
      id: r.id,
      index: { id: 'default', name: 'default' },
      fields: r.source,
    }));

    apiClient.streamSummary(
      {
        query,
        results: summarizeResults,
        totalResults: results.length,
        instruction: 'After your summary, on a new line write FOLLOW_UP: followed by exactly 3 short follow-up search queries separated by |',
      },
      (content) => {
        setState((prev) => ({
          ...prev,
          summary: prev.summary + content,
        }));
      },
      () => {
        // Parse follow-up queries from the completed summary
        setState((prev) => {
          let displaySummary = prev.summary;
          let followUps: string[] = [];

          const followUpMatch = prev.summary.match(/FOLLOW_UP:\s*(.+)/i);
          if (followUpMatch) {
            followUps = followUpMatch[1]
              .split('|')
              .map(q => q.trim())
              .filter(q => q.length > 0 && q.length < 100);
            displaySummary = prev.summary.replace(/\n?\s*FOLLOW_UP:\s*.+/i, '').trim();
          }

          return {
            ...prev,
            summary: displaySummary,
            followUpQueries: followUps.slice(0, 3),
            isStreaming: false,
            isComplete: true,
          };
        });
      },
      (error) => {
        setState((prev) => ({
          ...prev,
          isStreaming: false,
          error,
        }));
      },
      abortControllerRef.current.signal
    );
  }, [settings.apiUrl, settings.accessToken, isConfigured]);

  // =========================================================================
  // ABORT
  // =========================================================================

  const abort = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setState((prev) => ({
      ...prev,
      isStreaming: false,
    }));
  }, []);

  // =========================================================================
  // RESET
  // =========================================================================

  const reset = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setState({
      summary: '',
      followUpQueries: [],
      isStreaming: false,
      isComplete: false,
      isCollapsed: false,
      error: null,
    });
  }, []);

  // =========================================================================
  // TOGGLE COLLAPSED
  // =========================================================================

  const toggleCollapsed = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isCollapsed: !prev.isCollapsed,
    }));
  }, []);

  // Should show if streaming or has content (and no error)
  const shouldShow = (state.isStreaming || state.summary.length > 0) && !state.error;

  return {
    ...state,
    generate,
    abort,
    reset,
    toggleCollapsed,
    shouldShow,
  };
}
