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
  // find tool. Search for it, but only return a hit that is the record asked for:
  // the top hit for an unknown id is usually an unrelated item.
  try {
    const response = await searchService.searchById(
      searchIndexId,
      { query: documentId, pageSize: FALLBACK_CANDIDATES },
      { triggerType: 'ai_tool' },
    );
    const match = response.hits.find((hit) => matchesRequestedRecord(documentId, hit.id, hit.source));
    if (match) {
      logger.info('Lookup id was not a document key — returning matching search hit', {
        searchIndexId,
        query: documentId,
        matchedId: match.id,
      });
      return {
        success: true,
        data: {
          id: match.id,
          document: match.source,
          matchedBy: 'search_fallback',
        },
      };
    }
  } catch (error) {
    logger.warn('Lookup search fallback failed (non-fatal)', { error: (error as Error).message });
  }

  return notFound(documentId);
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
    // took from an earlier answer. Only a hit that is the record asked for is returned.
    const searched = await connector.search(source, { query: documentId, offset: 0, limit: FALLBACK_CANDIDATES }, fields);
    const match = searched.hits.find((hit) => matchesRequestedRecord(documentId, hit.id, hit.source));
    if (match) {
      logger.info('External lookup id did not match — returning matching search hit', {
        dataSourceId: source.dataSourceId,
        query: documentId,
        matchedId: match.id,
      });
      return { success: true, data: { id: match.id, document: match.source, matchedBy: 'search_fallback' } };
    }

    return notFound(documentId);
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// ============================================================================
// SEARCH FALLBACK MATCHING
// ============================================================================

/** How many search hits the fallback checks for the record asked for. */
const FALLBACK_CANDIDATES = 5;

/** Fields that identify a record exactly: id, sku, productCode, item_number, ... */
const IDENTIFIER_FIELD = /(^|_|-)(id|sku|code|key|slug|handle|number|ref|ean|upc|gtin|mpn)$|(Id|ID|Sku|SKU|Code|Key|Slug|Handle|Number|Ref)$/;
/** Fields that name a record: name, title, productName, ... */
const NAME_FIELD = /name|title/i;
/** Fields about a related item (brandName, categoryId, ...), which don't identify this record. */
const RELATED_FIELD = /brand|category|categories|vendor|manufacturer|supplier|seller|parent|collection|store|author/i;
/** Fields naming the record's brand, which a request often puts next to the name. */
const BRAND_FIELD = /brand|vendor|manufacturer/i;

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/** A word without its plural ending, so "sweaters" and "sweater" compare equal. */
function singular(word: string): string {
  if (word.length <= 3 || word.endsWith('ss')) return word;
  if (/(ss|x|z|ch|sh)es$/.test(word)) return word.slice(0, -2);
  return word.endsWith('s') ? word.slice(0, -1) : word;
}

function wordsOf(text: string): string[] {
  return normalize(text).split(' ').filter(Boolean).map(singular);
}

/**
 * Whether a search hit is the record that was asked for:
 * - its id or an identifier field equals the requested value, or
 * - its name/title contains every requested word ("Crew Neck Sweater" finds
 *   "Vesper & Co Crew Neck Sweater"), or
 * - every word of its name and brand is in the request, and the name makes up at
 *   least half of it ("Casual Crew Neck Sweater by Vesper & Co", "... Sweater in tan").
 * Plurals count as the same word. "Haven & Hart Denim Bomber" does not find
 * "Haven & Hart Streetwear Denim Jacket"; "XYZ-999" finds nothing.
 */
export function matchesRequestedRecord(
  requested: string,
  hitId: string | undefined,
  fields: Record<string, unknown> | undefined,
): boolean {
  const wanted = normalize(requested);
  if (!wanted) return false;
  if (hitId !== undefined && normalize(String(hitId)) === wanted) return true;

  const entries = Object.entries(fields ?? {}).filter(
    (entry): entry is [string, string | number] => typeof entry[1] === 'string' || typeof entry[1] === 'number',
  );
  const brandWords = entries
    .filter(([name]) => BRAND_FIELD.test(name) && !IDENTIFIER_FIELD.test(name))
    .flatMap(([, value]) => wordsOf(String(value)));
  const wantedWords = new Set(wordsOf(requested));

  for (const [name, value] of entries) {
    if (RELATED_FIELD.test(name)) continue;
    if (IDENTIFIER_FIELD.test(name) && normalize(String(value)) === wanted) return true;
    if (NAME_FIELD.test(name)) {
      const nameWords = new Set(wordsOf(String(value)));
      if ([...wantedWords].every((word) => nameWords.has(word))) return true;
      const recordWords = new Set([...nameWords, ...brandWords]);
      if ([...recordWords].every((word) => wantedWords.has(word)) && nameWords.size * 2 >= wantedWords.size) {
        return true;
      }
    }
  }
  return false;
}

/**
 * No record matches. That is an answer, not a failure: there is no document, so
 * no product card is shown, and the planner counts it as zero results.
 */
function notFound(requested: string): OperationResult {
  return {
    success: true,
    data: { found: false, requested, message: `No record matches "${requested}".` },
  };
}
