// src/features/tools/executors/callers/elasticsearch.ts

/**
 * Elasticsearch caller for external data-source executors.
 *
 * Talks to a user's own Elasticsearch cluster over the REST API, mirroring the
 * normalized result shape of the Azure AI Search caller so the executor
 * switches (search / enumerate / lookup) stay provider-symmetric:
 *   - search    → { results: [{ id, score, data, highlights }], totalCount, took }
 *   - enumerate → { field, values: [{ value, count }], totalDistinctValues }
 *
 * Auth mirrors data-source.service#buildAuthHeaders: api_key → "ApiKey <key>",
 * bearer → "Bearer <key>", basic → "Basic <key>" (pre-encoded), none → no header.
 */

import type { ToolExecutionResult } from '../../tools.executor';

type OperationResult = Omit<ToolExecutionResult, 'durationMs'>;

export interface ElasticsearchConfig {
  endpoint: string;
  indexName: string;
  apiKey: string;
  /** How to present the credential — mirrors connection.authType. Defaults to api_key. */
  authType?: 'api_key' | 'basic' | 'bearer' | 'none';
}

function buildHeaders(config: ElasticsearchConfig): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (!config.apiKey) return headers;

  switch (config.authType) {
    case 'bearer':
      headers['Authorization'] = `Bearer ${config.apiKey}`;
      break;
    case 'basic':
      headers['Authorization'] = `Basic ${config.apiKey}`;
      break;
    case 'none':
      break;
    case 'api_key':
    default:
      headers['Authorization'] = `ApiKey ${config.apiKey}`;
      break;
  }
  return headers;
}

/**
 * POST {endpoint}/{indexName}/_search, with normalized error handling.
 * Returns `{ json }` on success or `{ error }` on failure — never both.
 */
async function esSearchRequest(
  config: ElasticsearchConfig,
  body: Record<string, unknown>,
): Promise<{ json?: ElasticsearchSearchResponse; error?: OperationResult }> {
  const endpoint = config.endpoint.replace(/\/$/, '');
  const url = `${endpoint}/${config.indexName}/_search`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: buildHeaders(config),
      body: JSON.stringify(body),
    });
  } catch (err) {
    return {
      error: { success: false, error: `Network error connecting to Elasticsearch: ${(err as Error).message}` },
    };
  }

  if (!response.ok) {
    let detail = '';
    try {
      const errorBody = await response.json() as { error?: { reason?: string; type?: string } };
      detail = errorBody?.error?.reason ?? errorBody?.error?.type ?? '';
    } catch {
      detail = await response.text().catch(() => '');
    }
    return {
      error: { success: false, error: `Elasticsearch returned HTTP ${response.status}${detail ? `: ${detail}` : ''}` },
    };
  }

  const json = await response.json() as ElasticsearchSearchResponse;
  return { json };
}

// ============================================================================
// SEARCH
// ============================================================================

interface ElasticsearchVectorQuery {
  vector: number[];
  fields: string;
  kNearestNeighborsCount: number;
}

interface ElasticsearchSearchInput {
  query: string;
  maxResults: number;
  /** Comma-separated searchable field names to match against (multi_match). */
  searchFields?: string;
  includeHighlights?: boolean;
  /** Comma-separated field names to highlight. */
  highlightFields?: string;
  /** Fields to return via _source filtering. */
  selectFields?: string[];
  /** Exact-match term filter (used by lookup-by-id). */
  termFilter?: { field: string; value: string };
  /** Vector query for hybrid (lexical + kNN) search. */
  vectorQuery?: ElasticsearchVectorQuery;
}

interface ElasticsearchHit {
  _id?: string;
  _score?: number | null;
  _source?: Record<string, unknown>;
  highlight?: Record<string, string[]>;
}

interface ElasticsearchSearchResponse {
  took?: number;
  hits?: {
    total?: { value?: number } | number;
    hits?: ElasticsearchHit[];
  };
  aggregations?: Record<string, { buckets?: Array<{ key: unknown; doc_count?: number }> }>;
}

function splitFields(value?: string): string[] {
  if (!value) return [];
  return value.split(',').map(f => f.trim()).filter(Boolean);
}

export async function callElasticsearchSearch(
  config: ElasticsearchConfig,
  input: ElasticsearchSearchInput,
): Promise<OperationResult> {
  const query = input.query?.trim() ?? '';
  const searchFields = splitFields(input.searchFields);

  // Build the lexical match clause.
  let matchClause: Record<string, unknown>;
  if (!query || query === '*') {
    matchClause = { match_all: {} };
  } else if (searchFields.length > 0) {
    matchClause = { multi_match: { query, fields: searchFields } };
  } else {
    // No known searchable fields — let ES search across all analyzed fields.
    matchClause = { simple_query_string: { query } };
  }

  // Apply an exact-match filter (lookup-by-id) when requested.
  const queryClause = input.termFilter
    ? { bool: { must: matchClause, filter: [{ term: { [input.termFilter.field]: input.termFilter.value } }] } }
    : matchClause;

  const body: Record<string, unknown> = {
    size: input.maxResults,
    track_total_hits: true,
    query: queryClause,
  };

  if (input.selectFields?.length) {
    body._source = input.selectFields;
  }

  const highlightFieldList = splitFields(input.highlightFields);
  if (input.includeHighlights && highlightFieldList.length > 0) {
    body.highlight = {
      pre_tags: ['<mark>'],
      post_tags: ['</mark>'],
      fields: Object.fromEntries(highlightFieldList.map(f => [f, {}])),
    };
  }

  // Hybrid search — ES combines the kNN clause with the lexical query.
  if (input.vectorQuery) {
    body.knn = {
      field: input.vectorQuery.fields,
      query_vector: input.vectorQuery.vector,
      k: input.vectorQuery.kNearestNeighborsCount,
      num_candidates: Math.max(input.vectorQuery.kNearestNeighborsCount * 2, 50),
    };
  }

  const res = await esSearchRequest(config, body);
  if (res.error || !res.json) return res.error ?? { success: false, error: 'Elasticsearch returned no response' };
  const json = res.json;

  const hits = json.hits?.hits ?? [];
  const rawTotal = json.hits?.total;
  const totalCount = typeof rawTotal === 'number' ? rawTotal : rawTotal?.value ?? hits.length;

  return {
    success: true,
    data: {
      results: hits.map((hit) => ({
        id: String(hit._id ?? ''),
        score: hit._score ?? 0,
        data: hit._source ?? {},
        ...(hit.highlight ? { highlights: hit.highlight } : {}),
      })),
      totalCount,
      took: json.took ?? 0,
    },
  };
}

// ============================================================================
// ENUMERATE (terms aggregation)
// ============================================================================

interface ElasticsearchEnumerateInput {
  field: string;
  maxValues: number;
}

export async function callElasticsearchEnumerate(
  config: ElasticsearchConfig,
  input: ElasticsearchEnumerateInput,
): Promise<OperationResult> {
  const body: Record<string, unknown> = {
    size: 0,
    query: { match_all: {} },
    aggs: {
      facet: {
        terms: { field: input.field, size: input.maxValues },
      },
    },
  };

  const res = await esSearchRequest(config, body);
  if (res.error || !res.json) return res.error ?? { success: false, error: 'Elasticsearch returned no response' };

  const buckets = res.json.aggregations?.facet?.buckets ?? [];

  return {
    success: true,
    data: {
      field: input.field,
      values: buckets.map(b => ({ value: b.key, count: b.doc_count ?? 0 })),
      totalDistinctValues: buckets.length,
    },
  };
}
