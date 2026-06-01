// src/features/tools/executors/data-source/shared.ts

/**
 * Shared utilities for data source operation executors.
 * Handles data source resolution, filter/sort building, and field formatting.
 */

import * as dataSourceService from '@/features/data-source/data-source.service';
import { resolveSecret } from '@/features/secrets/secrets.service';
import { createLogger } from '@/shared/logger/logger';
import type { ToolExecutionResult } from '../../tools.executor';
import type { FilterClause, SortClause } from '@/features/search/search.types';
import { parseSortInput } from '../sort-clause.util';
import type {
  DataSourceSchema,
  DataSourceField,
  SearchIndexDataSourceConfig,
  ExternalSearchIndexConfig,
} from '@/db/schema/data-sources.schema';

export const logger = createLogger('data-source-executor');

// Re-export types for consumers
export type { DataSourceSchema, DataSourceField };

// ============================================================================
// RESOLVED DATA SOURCE TYPES
// ============================================================================

export interface ResolvedManagedSource {
  kind: 'managed';
  searchIndexId: string;
  dataSourceId: string;
}

export interface ResolvedExternalSource {
  kind: 'external';
  provider: string;
  endpoint: string;
  indexName: string;
  apiKey: string;
  /** How the credential is presented (api_key / basic / bearer / none). */
  authType: 'api_key' | 'basic' | 'bearer' | 'none';
  dataSourceId: string;
}

export interface ResolvedFileStoreSource {
  kind: 'file_store';
  dataSourceId: string;
}

export type ResolvedSource = ResolvedManagedSource | ResolvedExternalSource | ResolvedFileStoreSource;

// ============================================================================
// DATA SOURCE RESOLVER
// ============================================================================

/**
 * Resolve a data source ID into connection details.
 * Works for both managed (search_index) and external (search_index_external) data sources.
 */
export async function resolveDataSource(dataSourceId: string): Promise<ResolvedSource> {
  const ds = await dataSourceService.getDataSourceById(dataSourceId);
  if (!ds) {
    throw new Error(`Data source not found: ${dataSourceId}`);
  }
  if (!ds.isActive) {
    throw new Error(`Data source "${ds.name}" is not active`);
  }

  if (ds.type === 'search_index') {
    const config = ds.config as SearchIndexDataSourceConfig;
    if (!config.searchIndexId) {
      throw new Error(`Data source "${ds.name}" is missing searchIndexId in config`);
    }
    return { kind: 'managed', searchIndexId: config.searchIndexId, dataSourceId: ds.id };
  }

  if (ds.type === 'search_index_external') {
    const config = ds.config as ExternalSearchIndexConfig;
    const conn = config.connection;

    if (!conn?.url || !conn?.indexName) {
      throw new Error(`Data source "${ds.name}" has incomplete connection config`);
    }

    let apiKey = '';
    if (conn.credentials?.secretRef) {
      const resolved = await resolveSecret(conn.credentials.secretRef);
      if (!resolved) {
        throw new Error(`Failed to resolve secret "${conn.credentials.secretRef}" for data source "${ds.name}"`);
      }
      apiKey = resolved;
    }

    const providerMap: Record<string, string> = {
      azure_ai_search: 'azure-ai-search',
      elasticsearch: 'elasticsearch',
    };

    return {
      kind: 'external',
      provider: providerMap[config.provider] ?? config.provider,
      endpoint: conn.url,
      indexName: conn.indexName,
      apiKey,
      authType: conn.authType,
      dataSourceId: ds.id,
    };
  }

  if (ds.type === 'file_store') {
    return { kind: 'file_store', dataSourceId: ds.id };
  }

  throw new Error(`Data source type "${ds.type}" is not supported for data source operations`);
}

// ============================================================================
// FILTER & SORT BUILDERS
// ============================================================================

export function buildFilterClauses(
  filters?: Array<{ field: string; operator: string; value: unknown }>,
): FilterClause[] {
  if (!filters?.length) return [];

  return filters.map(f => ({
    field: f.field,
    operator: f.operator as FilterClause['operator'],
    value: f.value as FilterClause['value'],
  }));
}

export function buildSortClauses(
  sort?: string | Array<{ field: string; direction?: 'asc' | 'desc' }>,
): SortClause[] {
  return parseSortInput(sort);
}

// ============================================================================
// FIELD FORMATTER
// ============================================================================

export function formatDataSourceField(field: DataSourceField) {
  return {
    name: field.name,
    displayName: field.displayName,
    type: field.type,
    isSearchable: field.isSearchable,
    isFilterable: field.isFilterable,
    isFacetable: field.isFacetable,
    role: field.role ?? undefined,
    description: field.description ?? undefined,
  };
}

// ============================================================================
// RESULT TYPE (re-export for convenience)
// ============================================================================

export type OperationResult = Omit<ToolExecutionResult, 'durationMs'>;
