// src/features/tools/executors/callers/azure-ai-search.ts

import type { ToolExecutionResult } from '../../tools.executor';

// Azure AI Search REST API version
const AZURE_API_VERSION = '2024-07-01';

interface AzureConfig {
  endpoint: string;
  indexName: string;
  apiKey: string;
}

// ============================================================================
// FACET / ENUMERATE
// ============================================================================

interface AzureEnumerateInput {
  field: string;
  maxValues: number;
}

interface AzureFacetDocument {
  '@search.facets'?: Record<string, Array<{ count: number; value: unknown }>>;
}

export async function callAzureAISearchEnumerate(
  config: AzureConfig,
  input: AzureEnumerateInput,
): Promise<Omit<ToolExecutionResult, 'durationMs'>> {
  const endpoint = config.endpoint.replace(/\/$/, '');
  const url = `${endpoint}/indexes/${config.indexName}/docs/search?api-version=${AZURE_API_VERSION}`;

  const body: Record<string, unknown> = {
    search: '*',
    top: 0,
    count: false,
    facets: [`${input.field},count:${input.maxValues},sort:count`],
  };

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': config.apiKey,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return {
      success: false,
      error: `Network error connecting to Azure AI Search: ${(err as Error).message}`,
    };
  }

  if (!response.ok) {
    let detail = '';
    try {
      const errorBody = await response.json() as { error?: { message?: string } };
      detail = errorBody?.error?.message ?? '';
    } catch {
      detail = await response.text().catch(() => '');
    }
    return {
      success: false,
      error: `Azure AI Search returned HTTP ${response.status}${detail ? `: ${detail}` : ''}`,
    };
  }

  const json = await response.json() as AzureFacetDocument;
  const buckets = json['@search.facets']?.[input.field] ?? [];

  return {
    success: true,
    data: {
      field: input.field,
      values: buckets.map(b => ({ value: b.value, count: b.count })),
      totalDistinctValues: buckets.length,
    },
  };
}

interface AzureVectorQuery {
  vector: number[];
  fields: string;
  kNearestNeighborsCount: number;
}

interface AzureSearchInput {
  query: string;
  maxResults: number;
  includeHighlights?: boolean;
  /** Comma-separated list of searchable field names for highlighting */
  highlightFields?: string;
  /** OData filter expression (e.g. "category eq 'Electronics'") */
  filter?: string;
  /** Fields to return via $select — reduces payload from Azure */
  selectFields?: string[];
  /** Semantic configuration name for semantic ranking */
  semanticConfigName?: string;
  /** Vector query for hybrid search */
  vectorQuery?: AzureVectorQuery;
}

interface AzureSearchDocument {
  '@search.score': number;
  '@search.highlights'?: Record<string, string[]>;
  [key: string]: unknown;
}

export async function callAzureAISearch(
  config: AzureConfig,
  input: AzureSearchInput,
): Promise<Omit<ToolExecutionResult, 'durationMs'>> {
  const endpoint = config.endpoint.replace(/\/$/, '');
  const url = `${endpoint}/indexes/${config.indexName}/docs/search?api-version=${AZURE_API_VERSION}`;

  const body: Record<string, unknown> = {
    search: input.query,
    top: input.maxResults,
    count: true,
    searchMode: 'all',
  };

  if (input.filter) {
    body.filter = input.filter;
  }

  if (input.selectFields?.length) {
    body.select = input.selectFields.join(',');
  }

  if (input.includeHighlights && input.highlightFields) {
    body.highlight = input.highlightFields;
    body.highlightPreTag = '<mark>';
    body.highlightPostTag = '</mark>';
  }

  // Semantic ranking — enables Azure's L2 semantic reranker
  if (input.semanticConfigName) {
    body.queryType = 'semantic';
    body.semanticConfiguration = input.semanticConfigName;
  }

  // Vector search — enables hybrid (lexical + vector) via Azure's native RRF fusion
  if (input.vectorQuery) {
    body.vectorQueries = [
      {
        kind: 'vector',
        vector: input.vectorQuery.vector,
        fields: input.vectorQuery.fields,
        k: input.vectorQuery.kNearestNeighborsCount,
      },
    ];
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': config.apiKey,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return {
      success: false,
      error: `Network error connecting to Azure AI Search: ${(err as Error).message}`,
    };
  }

  if (!response.ok) {
    let detail = '';
    try {
      const errorBody = await response.json() as { error?: { message?: string } };
      detail = errorBody?.error?.message ?? '';
    } catch {
      detail = await response.text().catch(() => '');
    }
    return {
      success: false,
      error: `Azure AI Search returned HTTP ${response.status}${detail ? `: ${detail}` : ''}`,
    };
  }

  const json = await response.json() as {
    '@odata.count'?: number;
    value: AzureSearchDocument[];
  };

  const docs = json.value ?? [];

  return {
    success: true,
    data: {
      results: docs.map((doc) => {
        const { '@search.score': score, '@search.highlights': highlights, ...fields } = doc;
        // Use the first string-valued field named 'id', 'key', or fall back to index position
        const id = String(
          fields.id ?? fields.key ?? fields.Id ?? fields.Key ?? '',
        );
        return { id, score: (score as number) ?? 0, data: fields, highlights };
      }),
      totalCount: json['@odata.count'] ?? docs.length,
      took: 0, // Azure does not expose server-side execution time
    },
  };
}
