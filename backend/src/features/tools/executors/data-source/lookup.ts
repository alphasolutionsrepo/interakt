// src/features/tools/executors/data-source/lookup.ts

/**
 * Data Source Lookup Executor
 *
 * Single-purpose executor: retrieves a specific document by its unique identifier.
 * The AI uses this when it has a specific document ID and needs full details.
 */

import * as searchService from '@/features/search/search.service';
import * as dataSourceService from '@/features/data-source/data-source.service';
import { callAzureAISearch } from '../callers/azure-ai-search';
import { callElasticsearchSearch } from '../callers/elasticsearch';
import { executeFileStoreLookup } from './file-store';
import {
  resolveDataSource,
  logger,
  type DataSourceSchema,
  type ResolvedExternalSource,
  type OperationResult,
} from './shared';

// ============================================================================
// INPUT TYPE
// ============================================================================

interface LookupInput {
  id: string;
}

// ============================================================================
// CONFIG TYPE
// ============================================================================

interface LookupConfig {
  idField?: string;
  includeFields?: string[];
  excludeFields?: string[];
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

export async function executeDataSourceLookup(
  dataSourceId: string,
  config: Record<string, unknown>,
  input: Record<string, unknown>,
): Promise<OperationResult> {
  const lookupConfig = config as unknown as LookupConfig;
  const lookupInput = input as unknown as LookupInput;

  try {
    if (!dataSourceId) {
      return { success: false, error: 'dataSourceId is required for lookup operations' };
    }

    const documentId = lookupInput.id;
    if (!documentId) {
      return { success: false, error: 'An "id" parameter is required to look up a document' };
    }

    const source = await resolveDataSource(dataSourceId);

    if (source.kind === 'file_store') return executeFileStoreLookup(dataSourceId, config, input);

    // Managed indexes fetch by document key — provider-agnostic (ES _id / Azure key).
    if (source.kind === 'managed') {
      return lookupFromManagedIndex(source.searchIndexId, documentId);
    }

    // External sources still look up via a filterable id field.
    const idField = lookupConfig.idField ?? await resolveIdField(source.dataSourceId);
    return lookupFromExternalSource(source, idField, documentId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Data source lookup failed', error as Error, { dataSourceId });
    return { success: false, error: message };
  }
}

// ============================================================================
// ID FIELD RESOLUTION
// ============================================================================

/**
 * Determine the correct ID field name from the data source schema.
 * Priority: schema field with role='id' → common field names → fallback 'id'.
 */
async function resolveIdField(dataSourceId: string): Promise<string> {
  try {
    const ds = await dataSourceService.getDataSourceById(dataSourceId);
    if (ds?.schema) {
      const schema = ds.schema as DataSourceSchema;
      const idRoleField = schema.fields.find(f => f.role === 'id');
      if (idRoleField) return idRoleField.name;
      // Fall back to common ID field names found in the schema
      for (const candidate of ['id', 'Id', 'key', 'Key', '_id']) {
        if (schema.fields.some(f => f.name === candidate)) return candidate;
      }
    }
  } catch {
    // Non-critical — fall through to default
  }
  return 'id';
}

// ============================================================================
// MANAGED INDEX LOOKUP
// ============================================================================

async function lookupFromManagedIndex(
  searchIndexId: string,
  documentId: string,
): Promise<OperationResult> {
  // Fetch by document key via the index's engine provider (ES _id / Azure key).
  // No filterable field or role:'id' needed — works identically for both providers.
  const doc = await searchService.getDocumentByIdFromIndex(searchIndexId, documentId);

  if (doc) {
    return {
      success: true,
      data: {
        id: doc.id,
        document: doc.fields,
      },
    };
  }

  // Fallback: the "id" often isn't a real document key — the planner commonly
  // passes a product name/title (e.g. "Vesper & Co Crew Neck Sweater") to the
  // find tool. Run a search and return the top match so a name never dead-ends
  // with "not found".
  try {
    const response = await searchService.searchById(searchIndexId, { query: documentId, pageSize: 1 });
    const top = response.hits[0];
    if (top) {
      logger.info('Lookup id was not a document key — returning top search match', {
        searchIndexId,
        query: documentId,
        matchedId: top.id,
      });
      return {
        success: true,
        data: {
          id: top.id,
          document: top.source,
          matchedBy: 'search_fallback',
        },
      };
    }
  } catch (error) {
    logger.warn('Lookup search fallback failed (non-fatal)', { error: (error as Error).message });
  }

  return {
    success: false,
    error: `Document with id="${documentId}" not found`,
  };
}

// ============================================================================
// EXTERNAL SOURCE LOOKUP
// ============================================================================

async function lookupFromExternalSource(
  source: ResolvedExternalSource,
  idField: string,
  documentId: string,
): Promise<OperationResult> {
  switch (source.provider) {
    case 'azure-ai-search': {
      const result = await callAzureAISearch(
        { endpoint: source.endpoint, indexName: source.indexName, apiKey: source.apiKey },
        {
          query: '*',
          maxResults: 1,
          filter: `${idField} eq '${documentId}'`,
        },
      );
      if (!result.success) return result;
      const data = result.data as { results: Array<{ id: string; score: number; data: unknown }> };
      if (!data.results?.length) {
        return { success: false, error: `Document with ${idField}="${documentId}" not found` };
      }
      return { success: true, data: { id: data.results[0].id, document: data.results[0].data } };
    }

    case 'elasticsearch': {
      const result = await callElasticsearchSearch(
        { endpoint: source.endpoint, indexName: source.indexName, apiKey: source.apiKey, authType: source.authType },
        {
          query: '*',
          maxResults: 1,
          termFilter: { field: idField, value: documentId },
        },
      );
      if (!result.success) return result;
      const data = result.data as { results: Array<{ id: string; score: number; data: unknown }> };
      if (!data.results?.length) {
        return { success: false, error: `Document with ${idField}="${documentId}" not found` };
      }
      return { success: true, data: { id: data.results[0].id, document: data.results[0].data } };
    }

    default:
      return {
        success: false,
        error: `Lookup for provider '${source.provider}' is not yet implemented`,
      };
  }
}
