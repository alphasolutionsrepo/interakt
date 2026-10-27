// src/features/tools/executors/data-source/enumerate.ts

/**
 * Data Source Enumerate Executor
 *
 * Single-purpose executor: lists distinct values for a specific field.
 * The AI uses this to discover valid filter values before searching
 * (e.g., "what categories exist?", "what brands are available?").
 */

import * as searchService from '@/features/search/search.service';
import * as searchIndexService from '@/features/search-index/search-index.service';
import * as dataSourceService from '@/features/data-source/data-source.service';
import { getConnector } from '@/features/data-source/external-search/external-search.service';
import {
  resolveDataSource,
  logger,
  type DataSourceSchema,
  type DataSourceField,
  type ResolvedExternalSource,
  type OperationResult,
} from './shared';

// ============================================================================
// INPUT TYPE
// ============================================================================

interface EnumerateInput {
  field: string;
  maxValues?: number;
}

// ============================================================================
// CONFIG TYPE
// ============================================================================

interface EnumerateConfig {
  maxValues?: number;
  defaultField?: string;
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

export async function executeDataSourceEnumerate(
  dataSourceId: string,
  config: Record<string, unknown>,
  input: Record<string, unknown>,
): Promise<OperationResult> {
  const enumConfig = config as unknown as EnumerateConfig;
  const enumInput = input as unknown as EnumerateInput;

  try {
    if (!dataSourceId) {
      return { success: false, error: 'dataSourceId is required for enumerate operations' };
    }

    const field = enumInput.field ?? enumConfig.defaultField;
    if (!field) {
      return { success: false, error: 'A "field" parameter is required to enumerate values' };
    }

    const maxValues = enumInput.maxValues ?? enumConfig.maxValues ?? 50;
    const source = await resolveDataSource(dataSourceId);

    // Enumerate is not meaningful for file_store (unstructured text chunks)
    if (source.kind === 'file_store') {
      return { success: false, error: 'Enumerate is not supported for file_store data sources' };
    }

    // For managed indexes, use facet aggregation via search service
    if (source.kind === 'managed') {
      return enumerateFromManagedIndex(source.searchIndexId, field, maxValues);
    }

    // For external data sources, query the provider directly
    return enumerateFromExternalSource(source, field, maxValues);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Data source enumerate failed', error as Error, { dataSourceId });
    return { success: false, error: message };
  }
}

// ============================================================================
// MANAGED INDEX ENUMERATION (via facet aggregation)
// ============================================================================

async function enumerateFromManagedIndex(
  searchIndexId: string,
  field: string,
  maxValues: number,
): Promise<OperationResult> {
  const index = await searchIndexService.getSearchIndexById(searchIndexId);
  if (!index) {
    return { success: false, error: `Search index not found: ${searchIndexId}` };
  }

  const indexField = index.fields.find(f => f.fieldName === field);
  if (!indexField) {
    return { success: false, error: `Field "${field}" not found in index` };
  }
  if (!indexField.isFacetable) {
    return { success: false, error: `Field "${field}" is not facetable/filterable` };
  }

  // Recorded as the List Values tool's search: it loads a field's values, so search reports don't count it.
  const response = await searchService.searchById(searchIndexId, {
    query: '*',
    searchType: 'lexical',
    pageSize: 1, // facets are computed over the full match set regardless; we read only facets
    facets: [{
      field,
      type: 'terms',
      size: maxValues,
      orderBy: 'count',
      orderDirection: 'desc',
    }],
  }, { triggerType: 'ai_tool', triggerStep: 'enumerate' });

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

// ============================================================================
// EXTERNAL DATA SOURCE ENUMERATION (live facet query)
// ============================================================================

async function enumerateFromExternalSource(
  source: ResolvedExternalSource,
  field: string,
  maxValues: number,
): Promise<OperationResult> {
  // Validate the field against the schema, which also tells the connector how to
  // aggregate it (e.g. an Elasticsearch keyword sub-field).
  let fields: DataSourceField[] | undefined;
  try {
    const ds = await dataSourceService.getDataSourceById(source.dataSourceId);
    if (ds?.schema) {
      fields = (ds.schema as DataSourceSchema).fields;
      const dsField = fields.find(f => f.name === field);
      if (dsField && !dsField.isFilterable && !dsField.isFacetable) {
        return { success: false, error: `Field "${field}" is not filterable/facetable` };
      }
    }
  } catch {
    // Non-critical schema check — proceed with the live query
  }

  // A facet-only search: no hits, one terms facet on the field.
  const connector = getConnector(source.provider);
  if (!connector) {
    return {
      success: false,
      error: `Enumerate is not yet implemented for provider '${source.provider}'`,
    };
  }

  try {
    const result = await connector.search(
      source,
      { query: '*', offset: 0, limit: 0, facets: [{ field, size: maxValues }] },
      fields,
    );
    const buckets = result.facets?.find((f) => f.field === field)?.buckets ?? [];
    return {
      success: true,
      data: {
        field,
        values: buckets.map((b) => ({ value: b.key, count: b.count })),
        totalDistinctValues: buckets.length,
      },
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
