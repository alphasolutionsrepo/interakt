// src/features/tools/executors/search-provider.ts

/**
 * Multi-Action Search Tool Executor
 *
 * Supports three actions for AI schema discovery and data retrieval:
 * - search:       Query with filters, sort, facets → ranked results + facet values
 * - describe:     Get field schema (names, types, filterable, sortable, searchable)
 * - field_values: Get top N values for a specific filterable field
 *
 * Data source resolution:
 * - All search tools reference a data source by ID (dataSourceId)
 * - "search_index" data sources → use managed search service
 * - "search_index_external" data sources → resolve connection details and use provider-specific callers
 */

import * as searchService from '@/features/search/search.service';
import * as searchIndexService from '@/features/search-index/search-index.service';
import * as dataSourceService from '@/features/data-source/data-source.service';
import { getGlobalSearchConfig } from '@/features/global-settings/global-settings.service';
import { resolveSecret } from '@/features/secrets/secrets.service';
import { callAzureAISearch } from './callers/azure-ai-search';
import { callElasticsearchSearch } from './callers/elasticsearch';
import { embed } from '@/features/embedding/embedding.service';
import { createLogger } from '@/shared/logger/logger';
import type { ToolExecutionResult } from '../tools.executor';
import type { FilterClause, SortClause } from '@/features/search/search.types';
import { parseSortInput } from './sort-clause.util';
import type {
  DataSourceSchema,
  DataSourceField,
  SearchIndexDataSourceConfig,
  ExternalSearchIndexConfig,
} from '@/db/schema/data-sources.schema';

const logger = createLogger('search-executor');

// ============================================================================
// INPUT TYPES
// ============================================================================

type SearchAction = 'search' | 'describe' | 'field_values';

interface SearchInput {
  action?: SearchAction;
  query?: string;
  filters?: Array<{ field: string; operator: string; value: unknown }>;
  sort?: string | Array<{ field: string; direction?: 'asc' | 'desc' }>;
  maxResults?: number;
  field?: string; // for field_values action
  topN?: number;  // for field_values action
}

// ============================================================================
// CONFIG TYPE (from tool.config)
// ============================================================================

interface SearchToolConfig {
  dataSourceId: string;
  maxResults?: number;
  defaultFilters?: Array<{ field: string; operator: string; value: unknown }>;
}

// ============================================================================
// RESOLVED DATA SOURCE (internal)
// ============================================================================

interface ResolvedManagedSource {
  kind: 'managed';
  searchIndexId: string;
  dataSourceId: string;
}

interface ResolvedExternalSource {
  kind: 'external';
  provider: string;
  endpoint: string;
  indexName: string;
  apiKey: string;
  authType: 'api_key' | 'basic' | 'bearer' | 'none';
  dataSourceId: string;
}

type ResolvedSource = ResolvedManagedSource | ResolvedExternalSource;

// ============================================================================
// DATA SOURCE RESOLVER
// ============================================================================

async function resolveDataSource(dataSourceId: string): Promise<ResolvedSource> {
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

    // Resolve API key from secrets vault
    let apiKey = '';
    if (conn.credentials?.secretRef) {
      const resolved = await resolveSecret(conn.credentials.secretRef);
      if (!resolved) {
        throw new Error(`Failed to resolve secret "${conn.credentials.secretRef}" for data source "${ds.name}"`);
      }
      apiKey = resolved;
    }

    // Map provider names (data source uses underscores, callers use hyphens)
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

  throw new Error(`Data source type "${ds.type}" is not supported for search tools`);
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

export async function executeSearchProvider(
  config: Record<string, unknown>,
  input: Record<string, unknown>,
): Promise<Omit<ToolExecutionResult, 'durationMs'>> {
  const toolConfig = config as unknown as SearchToolConfig;
  const action = (input.action as SearchAction | undefined) ?? 'search';

  try {
    // Resolve the data source to get connection details
    const dataSourceId = toolConfig.dataSourceId;
    if (!dataSourceId) {
      return { success: false, error: 'dataSourceId is required — select a data source for this tool' };
    }

    const source = await resolveDataSource(dataSourceId);

    switch (action) {
      case 'search':
        return source.kind === 'external'
          ? executeExternalSearch(source, toolConfig, input as unknown as SearchInput)
          : executeManagedSearch(source, toolConfig, input as unknown as SearchInput);

      case 'describe':
        return executeDescribe(source, toolConfig);

      case 'field_values':
        return executeFieldValues(source, toolConfig, input as unknown as SearchInput);

      default:
        return { success: false, error: `Unknown search action: "${action}". Supported: search, describe, field_values` };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Search executor failed', error as Error, { action });
    return { success: false, error: message };
  }
}

// ============================================================================
// ACTION: SEARCH (managed index)
// ============================================================================

async function executeManagedSearch(
  source: ResolvedManagedSource,
  toolConfig: SearchToolConfig,
  input: SearchInput,
): Promise<Omit<ToolExecutionResult, 'durationMs'>> {
  const query = input.query ?? '';
  const maxResults = input.maxResults ?? toolConfig.maxResults ?? 10;

  const filters = buildFilterClauses(input.filters);
  const sort = buildSortClauses(input.sort);

  const globalConfig = await getGlobalSearchConfig();
  const response = await searchService.searchById(source.searchIndexId, {
    query,
    pageSize: maxResults,
    filters: filters.length > 0 ? filters : undefined,
    sort: sort.length > 0 ? sort : undefined,
  }, {
    hybridConfig: globalConfig.hybridDefaults,
    timeoutMs: globalConfig.timeout.timeoutMs,
  });

  return {
    success: true,
    data: {
      results: response.hits.map((hit) => ({
        id: hit.id,
        score: hit.score,
        data: hit.source,
        ...(hit.highlights ? { highlights: hit.highlights } : {}),
      })),
      totalCount: response.total.value,
      took: response.took,
      ...(response.facets?.length ? {
        facets: response.facets.map(f => ({
          field: f.field,
          buckets: f.buckets.map(b => ({
            value: b.key,
            count: b.count,
          })),
        })),
      } : {}),
    },
  };
}

// ============================================================================
// ACTION: SEARCH (external index)
// ============================================================================

async function executeExternalSearch(
  source: ResolvedExternalSource,
  toolConfig: SearchToolConfig,
  input: SearchInput,
): Promise<Omit<ToolExecutionResult, 'durationMs'>> {
  const query = input.query ?? '';
  const maxResults = Number(input.maxResults ?? toolConfig.maxResults ?? 10);
  logger.info('External search executing', { query, maxResults, inputMaxResults: input.maxResults, configMaxResults: toolConfig.maxResults });

  // Try to get field metadata + capabilities from data source schema
  let highlightFields: string | undefined;
  let selectFields: string[] | undefined;
  let semanticConfigName: string | undefined;
  let vectorFieldName: string | undefined;
  let vectorDimensions: number | undefined;
  let searchType: string | undefined;
  try {
    const ds = await dataSourceService.getDataSourceById(source.dataSourceId);
    if (ds?.schema) {
      const schema = ds.schema as DataSourceSchema;
      // Only request retrievable, non-vector fields — respects index management settings
      const retrievable = schema.fields.filter(f => f.type !== 'vector' && f.isRetrievable !== false);
      const searchable = retrievable
        .filter(f => f.isSearchable)
        .map(f => f.name);
      if (searchable.length > 0) {
        highlightFields = searchable.join(',');
      }
      if (retrievable.length > 0) {
        selectFields = retrievable.map(f => f.name);
      }
      // Extract discovered capabilities for hybrid search
      if (schema.capabilities?.semanticConfigName) {
        semanticConfigName = schema.capabilities.semanticConfigName;
      }
      if (schema.capabilities?.vectorField) {
        vectorFieldName = schema.capabilities.vectorField.name;
        vectorDimensions = schema.capabilities.vectorField.dimensions;
      }
    }
    // Get configured search type from data source config
    if (ds?.config) {
      const config = ds.config as ExternalSearchIndexConfig;
      searchType = config.searchDefaults?.searchType;
    }
  } catch {
    // Non-critical — proceed without highlights/select/capabilities
  }

  // Generate query embedding for hybrid/semantic search if vector field is available
  let queryEmbedding: number[] | undefined;
  if (vectorFieldName && vectorDimensions && (searchType === 'hybrid' || searchType === 'semantic' || searchType === 'auto')) {
    try {
      const embedding = await embed(query);
      if (embedding) {
        queryEmbedding = embedding;
      }
    } catch {
      // Non-critical — fall back to lexical search
      logger.warn('Failed to generate query embedding for external search, falling back to lexical');
    }
  }

  switch (source.provider) {
    case 'azure-ai-search':
      return callAzureAISearch(
        { endpoint: source.endpoint, indexName: source.indexName, apiKey: source.apiKey },
        {
          query,
          maxResults,
          includeHighlights: !!highlightFields,
          highlightFields,
          selectFields,
          semanticConfigName,
          vectorQuery: queryEmbedding && vectorFieldName ? {
            vector: queryEmbedding,
            fields: vectorFieldName,
            kNearestNeighborsCount: maxResults,
          } : undefined,
        },
      );

    case 'elasticsearch':
      return callElasticsearchSearch(
        { endpoint: source.endpoint, indexName: source.indexName, apiKey: source.apiKey, authType: source.authType },
        {
          query,
          maxResults,
          includeHighlights: !!highlightFields,
          highlightFields,
          searchFields: highlightFields,
          selectFields,
          vectorQuery: queryEmbedding && vectorFieldName ? {
            vector: queryEmbedding,
            fields: vectorFieldName,
            kNearestNeighborsCount: maxResults,
          } : undefined,
        },
      );

    default:
      return {
        success: false,
        error: `Executor for provider '${source.provider}' is not yet implemented`,
      };
  }
}

// ============================================================================
// ACTION: DESCRIBE
// Returns field schema so AI knows what's available for filtering/sorting.
// ============================================================================

async function executeDescribe(
  source: ResolvedSource,
  _toolConfig: SearchToolConfig,
): Promise<Omit<ToolExecutionResult, 'durationMs'>> {
  // Try data source schema first (works for both managed and external)
  const ds = await dataSourceService.getDataSourceById(source.dataSourceId);
  if (ds?.schema) {
    const schema = ds.schema as DataSourceSchema;
    return {
      success: true,
      data: {
        source: 'data_source',
        dataSourceId: ds.id,
        fields: schema.fields.map(formatDataSourceField),
        lastDiscoveredAt: schema.lastDiscoveredAt,
      },
    };
  }

  // Fall back to search index fields (for managed indexes)
  if (source.kind === 'managed') {
    const index = await searchIndexService.getSearchIndexById(source.searchIndexId);
    if (!index) {
      return { success: false, error: `Search index not found: ${source.searchIndexId}` };
    }

    const fields = index.fields
      .filter(f => !f.isSystemField && f.isMapped)
      .map(f => ({
        name: f.fieldName,
        displayName: f.displayName ?? f.fieldName,
        type: f.fieldType,
        isSearchable: f.isSearchable,
        isFilterable: f.isFacetable,
        isSortable: f.fieldType !== 'text',
        isFacetable: f.isFacetable,
        boost: f.boostValue !== 1.0 ? f.boostValue : undefined,
        hasValueMappings: Object.keys(f.filterValueMappings ?? {}).length > 0,
      }));

    return {
      success: true,
      data: {
        source: 'search_index',
        searchIndexId: index.id,
        indexName: index.name,
        searchType: index.searchType,
        documentCount: index.documentCount,
        fields,
      },
    };
  }

  return { success: false, error: 'No schema available for this data source. Run a health check to discover the schema.' };
}

// ============================================================================
// ACTION: FIELD_VALUES
// Returns top N values for a filterable field (via facet aggregation).
// ============================================================================

async function executeFieldValues(
  source: ResolvedSource,
  _toolConfig: SearchToolConfig,
  input: SearchInput,
): Promise<Omit<ToolExecutionResult, 'durationMs'>> {
  const field = input.field;
  if (!field) {
    return { success: false, error: 'field_values action requires a "field" parameter' };
  }

  const topN = input.topN ?? 20;

  // For managed indexes, use facet aggregation
  if (source.kind === 'managed') {
    const index = await searchIndexService.getSearchIndexById(source.searchIndexId);
    if (!index) {
      return { success: false, error: `Search index not found: ${source.searchIndexId}` };
    }

    const indexField = index.fields.find(f => f.fieldName === field);
    if (!indexField) {
      return { success: false, error: `Field "${field}" not found in index` };
    }
    if (!indexField.isFacetable) {
      return { success: false, error: `Field "${field}" is not facetable/filterable` };
    }

    const response = await searchService.searchById(source.searchIndexId, {
      query: '*',
      searchType: 'lexical',
      pageSize: 1, // facets are computed over the full match set regardless; we read only facets
      facets: [{
        field,
        type: 'terms',
        size: topN,
        orderBy: 'count',
        orderDirection: 'desc',
      }],
    });

    const facet = response.facets?.find(f => f.field === field);
    const valueMappings = indexField.filterValueMappings ?? {};

    return {
      success: true,
      data: {
        field,
        values: facet?.buckets.map(b => ({
          value: b.key,
          count: b.count,
        })) ?? [],
        totalDistinctValues: facet?.buckets.length ?? 0,
        ...(Object.keys(valueMappings).length > 0 ? { valueMappings } : {}),
      },
    };
  }

  // For external data sources, return what's in the schema
  return getFieldValuesFromDataSource(source.dataSourceId, field);
}

// ============================================================================
// HELPERS
// ============================================================================

function buildFilterClauses(
  filters?: Array<{ field: string; operator: string; value: unknown }>,
): FilterClause[] {
  if (!filters?.length) return [];

  return filters.map(f => ({
    field: f.field,
    operator: f.operator as FilterClause['operator'],
    value: f.value as FilterClause['value'],
  }));
}

function buildSortClauses(
  sort?: string | Array<{ field: string; direction?: 'asc' | 'desc' }>,
): SortClause[] {
  return parseSortInput(sort);
}

function formatDataSourceField(field: DataSourceField) {
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

async function getFieldValuesFromDataSource(
  dataSourceId: string,
  field: string,
): Promise<Omit<ToolExecutionResult, 'durationMs'>> {
  const ds = await dataSourceService.getDataSourceById(dataSourceId);
  if (!ds?.schema) {
    return { success: false, error: 'Data source not found or has no schema' };
  }

  const schema = ds.schema as DataSourceSchema;
  const dsField = schema.fields.find(f => f.name === field);
  if (!dsField) {
    return { success: false, error: `Field "${field}" not found in data source schema` };
  }
  if (!dsField.isFilterable && !dsField.isFacetable) {
    return { success: false, error: `Field "${field}" is not filterable` };
  }

  return {
    success: true,
    data: {
      field,
      values: [],
      totalDistinctValues: 0,
      note: 'Live field values require a backing search index. Use the search action with facets for dynamic values.',
    },
  };
}
