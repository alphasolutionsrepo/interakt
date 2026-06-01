// src/features/web-search/web-search.service.ts

/**
 * Web Search Service
 *
 * Thin wrapper over the Tavily AI Search REST API.
 * Uses native fetch (no SDK dependency).
 */

import type { WebSearchResponse, WebSearchOptions } from './web-search.types';
import { createLogger } from '@/shared/logger/logger';

const logger = createLogger('web-search');

// ============================================================================
// CONFIGURATION
// ============================================================================

const TAVILY_API_URL = 'https://api.tavily.com/search';
const DEFAULT_MAX_RESULTS = 3;
const DEFAULT_SEARCH_DEPTH = 'basic';
const REQUEST_TIMEOUT_MS = 10_000;

// ============================================================================
// SERVICE
// ============================================================================

/**
 * Search the web using Tavily AI Search.
 *
 * Requires TAVILY_API_KEY environment variable.
 * Always enables safe_search on the Tavily side.
 */
export async function searchWeb(
  query: string,
  options?: WebSearchOptions
): Promise<WebSearchResponse> {
  const apiKey = process.env.TAVILY_API_KEY;

  if (!apiKey) {
    throw new Error('TAVILY_API_KEY environment variable is not set');
  }

  const maxResults = options?.maxResults ?? DEFAULT_MAX_RESULTS;
  const searchDepth = options?.searchDepth ?? DEFAULT_SEARCH_DEPTH;

  logger.debug('Searching web', {
    queryLength: query.length,
    maxResults,
    searchDepth,
  });

  const startTime = Date.now();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(TAVILY_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: maxResults,
        search_depth: searchDepth,
        include_answer: options?.includeAnswer ?? false,
        exclude_domains: options?.excludeDomains ?? [],
        // Note: safe_search is enterprise-only on Tavily.
        // Our own safety-classifier.ts handles query safety before this point.
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Tavily API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const responseTimeMs = Date.now() - startTime;

    const results = (data.results ?? []).map((r: { title?: string; url?: string; content?: string; score?: number }) => ({
      title: r.title ?? '',
      url: r.url ?? '',
      content: r.content ?? '',
      score: r.score ?? 0,
    }));

    logger.debug('Web search completed', {
      resultsCount: results.length,
      responseTimeMs,
    });

    return {
      results,
      answer: data.answer ?? undefined,
      responseTimeMs,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Web search timed out after ${REQUEST_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Check if web search is available (API key is configured).
 */
export function isWebSearchAvailable(): boolean {
  return !!process.env.TAVILY_API_KEY;
}
