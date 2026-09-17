'use client';

import { useState, useCallback, useRef } from 'react';
import { useSettings } from '@/contexts/settings-context';
import { createApiClient } from '@/lib/api/client';
import type { SearchResult } from '@/lib/api/types';

/**
 * Fewest results worth summarising.
 *
 * One is deliberate. A query understood well enough to return a single exact
 * match — "what's the price of SKU 08011-M?" resolving to one product — is the
 * best case for a summary, not a case to suppress. The old floor of three
 * predated query understanding and hid the answer precisely when it was most
 * certain.
 */
export const MIN_RESULTS_FOR_SUMMARY = 1;

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
    if (!isConfigured || results.length < MIN_RESULTS_FOR_SUMMARY) {
      // Clear whatever the last query produced. Bailing out silently used to
      // leave the previous summary on screen above the new results, where it
      // reads as an answer to the new query — a stale "I couldn't find the
      // price" sitting directly above the product card that states the price.
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      setState((prev) =>
        prev.summary || prev.isStreaming || prev.error
          ? {
              summary: '',
              followUpQueries: [],
              isStreaming: false,
              isComplete: false,
              isCollapsed: false,
              error: null,
            }
          : prev, // Already clear — returning prev avoids a pointless re-render.
      );
      return;
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

  // Idempotent: returns the previous state when there is nothing to clear, so
  // effects can call this on any render without forcing a pointless re-render.
  const reset = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setState((prev) =>
      prev.summary || prev.isStreaming || prev.error
        ? {
            summary: '',
            followUpQueries: [],
            isStreaming: false,
            isComplete: false,
            isCollapsed: false,
            error: null,
          }
        : prev,
    );
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
