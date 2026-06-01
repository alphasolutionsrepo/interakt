// src/features/tools/executors/web-search.ts
//
// Executes a web_search tool config via the Tavily Search API.
//
// Before this runs, resolveSecretRefs() has already processed {{secret:...}}
// patterns in string fields. The apiKeySecret field is a bare secret name
// (like http-api's authentication.valueRef), so we resolve it here directly.

import { resolveSecret } from '@/features/secrets/secrets.service';
import type { ToolExecutionResult } from '../tools.executor';

// ============================================================================
// CONFIG TYPES
// ============================================================================

interface WebSearchConfig {
  apiKeySecret?: string | null;
  maxResults?: number;
  searchDepth?: 'basic' | 'advanced';
  includeAnswer?: boolean;
  includeDomains?: string[];
  excludeDomains?: string[];
}

// ============================================================================
// TAVILY TYPES
// ============================================================================

interface TavilyRequest {
  query: string;
  search_depth?: 'basic' | 'advanced';
  max_results?: number;
  include_answer?: boolean;
  include_domains?: string[];
  exclude_domains?: string[];
}

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score?: number;
  published_date?: string;
}

interface TavilyResponse {
  query: string;
  answer?: string;
  results: TavilyResult[];
}

const TAVILY_SEARCH_URL = 'https://api.tavily.com/search';

// ============================================================================
// MAIN EXECUTOR
// ============================================================================

export async function executeWebSearch(
  config: Record<string, unknown>,
  input: Record<string, unknown>,
): Promise<Omit<ToolExecutionResult, 'durationMs'>> {
  const cfg = config as unknown as WebSearchConfig;

  const query = typeof input.query === 'string' ? input.query.trim() : '';
  if (!query) {
    return { success: false, error: 'Missing required input field: "query"' };
  }

  // Resolve API key from secrets vault
  const secretName = cfg.apiKeySecret?.trim();
  if (!secretName) {
    return { success: false, error: 'Web search tool is missing apiKeySecret configuration' };
  }

  const apiKey = await resolveSecret(secretName);
  if (!apiKey) {
    return { success: false, error: `Secret "${secretName}" not found in vault` };
  }

  // Allow the caller to override maxResults at runtime
  const inputMaxResults =
    typeof input.maxResults === 'number' ? Math.min(input.maxResults, 20) : undefined;
  const maxResults = inputMaxResults ?? cfg.maxResults ?? 5;

  const body: TavilyRequest = {
    query,
    search_depth: cfg.searchDepth ?? 'basic',
    max_results: maxResults,
    include_answer: cfg.includeAnswer ?? false,
  };

  // includeDomains takes priority — if set, excludeDomains is ignored (Tavily behaviour)
  if (cfg.includeDomains && cfg.includeDomains.length > 0) {
    body.include_domains = cfg.includeDomains;
  } else if (cfg.excludeDomains && cfg.excludeDomains.length > 0) {
    body.exclude_domains = cfg.excludeDomains;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(TAVILY_SEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return {
        success: false,
        error: `Tavily API error ${response.status}${text ? ': ' + text.slice(0, 300) : ''}`,
      };
    }

    let json: TavilyResponse;
    try {
      json = (await response.json()) as TavilyResponse;
    } catch {
      return { success: false, error: 'Tavily API response was not valid JSON' };
    }

    const results = (json.results ?? []).map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.content,
      score: r.score,
      publishedDate: r.published_date,
    }));

    return {
      success: true,
      data: {
        results,
        totalCount: results.length,
        ...(json.answer ? { answer: json.answer } : {}),
      },
    };
  } catch (err) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: msg.toLowerCase().includes('abort') ? 'Tavily request timed out after 15s' : msg,
    };
  }
}
