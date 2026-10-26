// src/features/data-source/external-search/connectors/search-engine.connectors.ts

/**
 * Elasticsearch and Azure AI Search connectors
 *
 * Thin adapters over the engine REST callers (../engines) and filter translation
 * (../external-query).
 */

import type { DataSourceField } from '@/db/schema/data-sources.schema';
import { callAzureAISearch } from '../engines/azure-ai-search';
import { callElasticsearchSearch } from '../engines/elasticsearch';
import { ELASTICSEARCH_DOCUMENT_ID, translateFilters, translateSort } from '../external-query';
import type {
  ExternalConnection,
  ExternalFacet,
  ExternalSearchConnector,
  ExternalSearchRequest,
  ExternalSearchResult,
} from '../external-search.types';

interface CallerData {
  results?: Array<{ id: string; score: number; data: Record<string, unknown>; highlights?: Record<string, string[]> }>;
  totalCount?: number;
  took?: number;
  facets?: ExternalFacet[];
}

function toResult(
  outcome: { success: boolean; data?: unknown; error?: string },
  unapplied: Pick<ExternalSearchResult, 'unappliedFilters' | 'unappliedSort'>,
): ExternalSearchResult {
  if (!outcome.success) throw new Error(outcome.error ?? 'External search failed');
  const data = (outcome.data ?? {}) as CallerData;
  return {
    hits: (data.results ?? []).map((r) => ({
      id: r.id,
      score: r.score,
      source: r.data,
      ...(r.highlights ? { highlights: r.highlights } : {}),
    })),
    total: data.totalCount ?? 0,
    facets: data.facets,
    took: data.took ?? 0,
    ...unapplied,
  };
}

/** Searchable, non-vector fields from the schema, as a comma-separated list. */
function searchableFields(fields: DataSourceField[] | undefined): string | undefined {
  const names = (fields ?? []).filter((f) => f.isSearchable && f.type !== 'vector').map((f) => f.name);
  return names.length > 0 ? names.join(',') : undefined;
}

export const elasticsearchConnector: ExternalSearchConnector = {
  provider: 'elasticsearch',
  displayName: 'Elasticsearch',
  // Hits carry Elasticsearch's _id, which often isn't a field of the document.
  capabilities: { facets: true, paging: true, sort: true, highlights: true, documentIdField: ELASTICSEARCH_DOCUMENT_ID },

  async search(connection: ExternalConnection, request: ExternalSearchRequest, fields?: DataSourceField[]) {
    const filters = translateFilters('elasticsearch', request.filters, fields);
    const sort = translateSort('elasticsearch', request.sort, fields);
    const byName = new Map((fields ?? []).map((f) => [f.name, f]));
    const highlightFields = request.highlightFields?.join(',');

    const outcome = await callElasticsearchSearch(
      {
        endpoint: connection.endpoint,
        indexName: connection.indexName,
        apiKey: connection.apiKey,
        authType: connection.authType,
      },
      {
        query: request.query,
        maxResults: request.limit,
        offset: request.offset,
        includeHighlights: !!highlightFields,
        highlightFields,
        searchFields: searchableFields(fields),
        selectFields: request.selectFields,
        filterClauses: filters.esClauses,
        sort: sort.esSort,
        // Text fields aggregate through their keyword sub-field when the schema names one.
        facets: request.facets?.map((f) => ({
          field: f.field,
          path: byName.get(f.field)?.filterField ?? f.field,
          size: f.size ?? 10,
        })),
      },
    );

    return toResult(outcome, { unappliedFilters: filters.unapplied, unappliedSort: sort.unapplied });
  },
};

export const azureAISearchConnector: ExternalSearchConnector = {
  provider: 'azure-ai-search',
  displayName: 'Azure AI Search',
  capabilities: { facets: true, paging: true, sort: true, highlights: true },

  async search(connection: ExternalConnection, request: ExternalSearchRequest, fields?: DataSourceField[]) {
    const filters = translateFilters('azure-ai-search', request.filters, fields);
    const sort = translateSort('azure-ai-search', request.sort, fields);
    const highlightFields = request.highlightFields?.join(',');

    const outcome = await callAzureAISearch(
      { endpoint: connection.endpoint, indexName: connection.indexName, apiKey: connection.apiKey },
      {
        query: request.query,
        maxResults: request.limit,
        offset: request.offset,
        includeHighlights: !!highlightFields,
        highlightFields,
        selectFields: request.selectFields,
        filter: filters.odata,
        orderBy: sort.odataOrderBy,
        facets: request.facets?.map((f) => ({ field: f.field, size: f.size ?? 10 })),
      },
    );

    return toResult(outcome, { unappliedFilters: filters.unapplied, unappliedSort: sort.unapplied });
  },
};
