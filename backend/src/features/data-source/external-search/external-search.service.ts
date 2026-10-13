// src/features/data-source/external-search/external-search.service.ts

/**
 * External Search Service
 *
 * One way to search an external index (data source type `search_index_external`),
 * shared by chat tools and search experiences: resolve the data source's connection,
 * pick its connector, run the search.
 */

import 'server-only';

import type {
  DataSourceField,
  DataSourceSchema,
  ExternalSearchIndexConfig,
} from '@/db/schema/data-sources.schema';
import { resolveExternalConnection } from './external-connection';
import * as dataSourceService from '../data-source.service';
import type {
  ExternalSearchConnector,
  ExternalSearchRequest,
  ExternalSearchResult,
} from './external-search.types';
import { elasticsearchConnector, azureAISearchConnector } from './connectors/search-engine.connectors';
import { sitecoreSearchConnector } from './connectors/sitecore-search.connector';

// ============================================================================
// CONNECTORS
// ============================================================================

const CONNECTORS: Record<string, ExternalSearchConnector> = {
  [elasticsearchConnector.provider]: elasticsearchConnector,
  [azureAISearchConnector.provider]: azureAISearchConnector,
  [sitecoreSearchConnector.provider]: sitecoreSearchConnector,
};

export { resolveExternalConnection };

export function getConnector(provider: string): ExternalSearchConnector | undefined {
  return CONNECTORS[provider];
}

// ============================================================================
// SEARCH
// ============================================================================

export interface ExternalSourceSearch {
  dataSource: { id: string; name: string; fields: DataSourceField[] };
  result: ExternalSearchResult;
}

/**
 * Search an external index by data source id.
 *
 * @throws Error when the data source is missing, inactive, not external, has no
 *   connector, or the engine call fails
 */
export async function searchExternalSource(
  dataSourceId: string,
  request: ExternalSearchRequest,
): Promise<ExternalSourceSearch> {
  const ds = await dataSourceService.getDataSourceById(dataSourceId);
  if (!ds) throw new Error(`Data source not found: ${dataSourceId}`);
  if (ds.type !== 'search_index_external') {
    throw new Error(`Data source "${ds.name}" is not an external index`);
  }
  if (!ds.isActive) throw new Error(`Data source "${ds.name}" is not active`);

  const connection = await resolveExternalConnection(ds.name, ds.config as ExternalSearchIndexConfig);
  const connector = getConnector(connection.provider);
  if (!connector) {
    throw new Error(`No search connector for provider '${connection.provider}'`);
  }

  const fields = (ds.schema as DataSourceSchema | null)?.fields ?? [];
  const result = await connector.search(connection, request, fields);

  return { dataSource: { id: ds.id, name: ds.name, fields }, result };
}
