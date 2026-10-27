// src/features/data-source/external-search/external-search.types.ts

/**
 * External Search — connector contract
 *
 * An external index is a data source of type `search_index_external`: a search
 * engine Interakt queries but does not own. Each engine (Elasticsearch, Azure AI
 * Search, Sitecore Search, ...) is a connector implementing this contract; chat
 * tools and search experiences both search through it, so adding an engine means
 * adding one connector.
 */

import type { FilterClause, SortClause } from '@/features/search/search.types';
import type { DataSourceField } from '@/db/schema/data-sources.schema';
import type { UnappliedClause } from './external-query';

/**
 * Upper bound for one request to an external engine, body included. Public search
 * waits on every source, so one slow engine must not hang the whole request.
 */
export const EXTERNAL_REQUEST_TIMEOUT_MS = 10_000;

/** Connection details resolved from a data source (credentials already decrypted). */
export interface ExternalConnection {
  /** Connector key, e.g. 'elasticsearch', 'azure-ai-search', 'sitecore-search' */
  provider: string;
  /** Base URL of the engine (or, for Sitecore, the full discover URL) */
  endpoint: string;
  /** Index name (or, for Sitecore, the widget id) */
  indexName: string;
  apiKey: string;
  authType: 'api_key' | 'basic' | 'bearer' | 'none';
  /** Connector-specific settings from the data source config */
  providerSettings: Record<string, unknown>;
}

export interface ExternalFacetRequest {
  field: string;
  size?: number;
}

export interface ExternalSearchRequest {
  /** Query text; empty or '*' means match everything */
  query: string;
  offset: number;
  limit: number;
  filters?: FilterClause[];
  sort?: SortClause[];
  facets?: ExternalFacetRequest[];
  /** Fields to return (all when omitted) */
  selectFields?: string[];
  /** Fields to highlight (none when omitted) */
  highlightFields?: string[];
}

export interface ExternalSearchHit {
  id: string;
  score: number;
  source: Record<string, unknown>;
  highlights?: Record<string, string[]>;
}

export interface ExternalFacet {
  field: string;
  /** Keys keep the engine's type: numeric values stay numbers, so they can be used as filter values */
  buckets: Array<{ key: string | number; count: number }>;
}

/** A requested clause the engine could not express, with the reason. */
export type { UnappliedClause };

export interface ExternalSearchResult {
  hits: ExternalSearchHit[];
  total: number;
  facets?: ExternalFacet[];
  took: number;
  unappliedFilters: UnappliedClause[];
  unappliedSort: UnappliedClause[];
}

export interface ExternalConnectorCapabilities {
  facets: boolean;
  paging: boolean;
  sort: boolean;
  highlights: boolean;
  /**
   * The field an `eq` filter finds a hit by the id this connector gives it, when that id isn't
   * a field of the document (Elasticsearch's `_id`). Find Record looks an id up there too.
   */
  documentIdField?: string;
}

export interface ExternalSearchConnector {
  /** Matches ExternalConnection.provider */
  readonly provider: string;
  readonly displayName: string;
  readonly capabilities: ExternalConnectorCapabilities;

  /**
   * Run a search. `fields` is the data source's discovered/curated schema, used to
   * pick filter fields and searchable fields; connectors must cope without it.
   *
   * @throws Error with a readable message when the engine call fails
   */
  search(
    connection: ExternalConnection,
    request: ExternalSearchRequest,
    fields?: DataSourceField[],
  ): Promise<ExternalSearchResult>;
}
