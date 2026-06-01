// src/features/tools/executors/data-source/inspect.ts

/**
 * Data Source Inspect Executor
 *
 * Single-purpose executor: describes the schema, available fields,
 * and capabilities of a data source. The AI uses this to understand
 * what filters, sorts, and search options are available BEFORE searching.
 */

import * as searchIndexService from '@/features/search-index/search-index.service';
import * as dataSourceService from '@/features/data-source/data-source.service';
import {
  resolveDataSource,
  formatDataSourceField,
  logger,
  type DataSourceSchema,
  type OperationResult,
} from './shared';

// ============================================================================
// CONFIG TYPE
// ============================================================================

interface InspectConfig {
  includeFieldStats?: boolean;
  includeExampleValues?: boolean;
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

export async function executeDataSourceInspect(
  dataSourceId: string,
  config: Record<string, unknown>,
  _input: Record<string, unknown>,
): Promise<OperationResult> {
  const _inspectConfig = config as unknown as InspectConfig;

  try {
    if (!dataSourceId) {
      return { success: false, error: 'dataSourceId is required for inspect operations' };
    }

    const source = await resolveDataSource(dataSourceId);

    // Try data source schema first (works for both managed and external)
    const ds = await dataSourceService.getDataSourceById(source.dataSourceId);
    if (ds?.schema) {
      const schema = ds.schema as DataSourceSchema;
      return {
        success: true,
        data: {
          source: 'data_source',
          dataSourceId: ds.id,
          dataSourceName: ds.name,
          dataSourceType: ds.type,
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

    return {
      success: false,
      error: 'No schema available for this data source. Run a health check to discover the schema.',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Data source inspect failed', error as Error, { dataSourceId });
    return { success: false, error: message };
  }
}
