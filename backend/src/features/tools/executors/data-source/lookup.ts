// src/features/tools/executors/data-source/lookup.ts

/**
 * Data Source Lookup Executor
 *
 * Single-purpose executor: retrieves a specific document by its unique identifier.
 * The AI uses this when it has a specific document ID and needs full details.
 */

import * as searchService from '@/features/search/search.service';
import * as dataSourceService from '@/features/data-source/data-source.service';
import { getConnector } from '@/features/data-source/external-search/external-search.service';
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
    const response = await searchService.searchById(searchIndexId, { query: documentId, pageSize: 1 }, { triggerType: 'ai_tool' });
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
  const connector = getConnector(source.provider);
  if (!connector) {
    return { success: false, error: `Lookup for provider '${source.provider}' is not yet implemented` };
  }

  const ds = await dataSourceService.getDataSourceById(source.dataSourceId);
  const fields = (ds?.schema as DataSourceSchema | null)?.fields;

  try {
    // The id filter can fail outright, e.g. an engine where the id attribute isn't
    // filterable. The search fallback below still finds the document then.
    const result = await connector
      .search(
        source,
        { query: '*', offset: 0, limit: 1, filters: [{ field: idField, operator: 'eq', value: documentId }] },
        fields,
      )
      .catch((error: unknown) => {
        logger.info('External lookup by id failed — falling back to search', {
          dataSourceId: source.dataSourceId,
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      });
    // An id filter the engine could not apply would return an arbitrary document,
    // so only trust a hit when the filter was applied.
    const hit = result && result.unappliedFilters.length === 0 ? result.hits[0] : undefined;
    if (hit) return { success: true, data: { id: hit.id, document: hit.source } };

    // Fallback, as for managed indexes: the "id" is often a name or title the planner
    // took from an earlier answer, so return the top search match for it.
    const searched = await connector.search(source, { query: documentId, offset: 0, limit: 1 }, fields);
    const top = searched.hits[0];
    if (top) {
      logger.info('External lookup id did not match — returning top search match', {
        dataSourceId: source.dataSourceId,
        query: documentId,
        matchedId: top.id,
      });
      return { success: true, data: { id: top.id, document: top.source, matchedBy: 'search_fallback' } };
    }

    return { success: false, error: `Document with ${idField}="${documentId}" not found` };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
