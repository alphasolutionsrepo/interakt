// src/features/tools/executors/data-source/lookup.ts

/**
 * Data Source Lookup Executor
 *
 * Single-purpose executor: retrieves one specific document by its id or, on a search
 * index, by a SKU or name (a search that keeps only the document asked for).
 */

import * as searchService from '@/features/search/search.service';
import * as dataSourceService from '@/features/data-source/data-source.service';
import { getConnector } from '@/features/data-source/external-search/external-search.service';
import { executeFileStoreLookup } from './file-store';
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

    // The branches below are returned, not awaited: an engine error rejects and reaches
    // executeTool, which retries transient errors and labels the call failed.
    if (source.kind === 'file_store') return executeFileStoreLookup(dataSourceId, config, input);

    const fields = await loadSchemaFields(dataSourceId);
    const nameFields = fields.filter((f) => f.role === 'title').map((f) => f.name);

    // Managed indexes fetch by document key — provider-agnostic (ES _id / Azure key).
    if (source.kind === 'managed') {
      return lookupFromManagedIndex(source.searchIndexId, documentId, nameFields);
    }

    // External sources still look up via a filterable id field.
    const idField = lookupConfig.idField ?? resolveIdField(fields);
    return lookupFromExternalSource(source, idField, documentId, fields, nameFields);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Data source lookup failed', error as Error, { dataSourceId });
    return { success: false, error: message };
  }
}

// ============================================================================
// ID FIELD RESOLUTION
// ============================================================================

/** The data source's discovered fields; none when it has no schema or can't be read. */
async function loadSchemaFields(dataSourceId: string): Promise<DataSourceField[]> {
  try {
    const ds = await dataSourceService.getDataSourceById(dataSourceId);
    return (ds?.schema as DataSourceSchema | null)?.fields ?? [];
  } catch (error) {
    // Non-critical: the lookup still works without roles (id field 'id', exact name fields)
    logger.warn('Could not read the data source schema for a lookup', {
      dataSourceId,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/**
 * Determine the correct ID field name from the data source schema.
 * Priority: schema field with role='id' → common field names → fallback 'id'.
 */
function resolveIdField(fields: DataSourceField[]): string {
  const idRoleField = fields.find(f => f.role === 'id');
  if (idRoleField) return idRoleField.name;
  // Fall back to common ID field names found in the schema
  for (const candidate of ['id', 'Id', 'key', 'Key', '_id']) {
    if (fields.some(f => f.name === candidate)) return candidate;
  }
  return 'id';
}

// ============================================================================
// MANAGED INDEX LOOKUP
// ============================================================================

async function lookupFromManagedIndex(
  searchIndexId: string,
  documentId: string,
  nameFields: string[],
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
  // the top hit for an unknown id is usually an unrelated item. A failed search is a failed
  // lookup, not "no such record".
  const response = await searchService.searchById(
    searchIndexId,
    { query: documentId, pageSize: FALLBACK_CANDIDATES },
    { triggerType: 'ai_tool' },
  );
  const resolved = resolveMatch(documentId, response.hits, nameFields);
  if (resolved.several) return severalMatch(documentId, resolved.several, nameFields);
  const match = resolved.one;
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

  return notFound(documentId, response.hits, nameFields);
}

// ============================================================================
// EXTERNAL SOURCE LOOKUP
// ============================================================================

async function lookupFromExternalSource(
  source: ResolvedExternalSource,
  idField: string,
  documentId: string,
  fields: DataSourceField[],
  nameFields: string[],
): Promise<OperationResult> {
  const connector = getConnector(source.provider);
  if (!connector) {
    return { success: false, error: `Lookup for provider '${source.provider}' is not yet implemented` };
  }

  // An engine error on the fallback search rejects, as on managed indexes, so executeTool
  // retries a transient one and labels a lasting one failed.
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
  const resolved = resolveMatch(documentId, searched.hits, nameFields);
  if (resolved.several) return severalMatch(documentId, resolved.several, nameFields);
  const match = resolved.one;
  if (match) {
    logger.info('External lookup id did not match — returning matching search hit', {
      dataSourceId: source.dataSourceId,
      query: documentId,
      matchedId: match.id,
    });
    return { success: true, data: { id: match.id, document: match.source, matchedBy: 'search_fallback' } };
  }

  return notFound(documentId, searched.hits, nameFields);
}

// ============================================================================
// SEARCH FALLBACK MATCHING
// ============================================================================

/** How many search hits the fallback checks for the record asked for. */
const FALLBACK_CANDIDATES = 5;

/** Fields that identify a record exactly: id, sku, productCode, item_number, ... */
const IDENTIFIER_FIELD = /(^|_|-)(id|sku|code|key|slug|handle|number|ref|ean|upc|gtin|mpn)$|(Id|ID|Sku|SKU|Code|Key|Slug|Handle|Number|Ref)$/;
/**
 * Fields that name a record, besides any the schema gives the 'title' role. Exact names, so
 * colorName or fileName don't count as the record's name.
 */
const NAME_FIELDS = new Set([
  'name', 'title', 'label', 'heading', 'displayname', 'productname', 'producttitle', 'itemname',
  'documenttitle', 'pagetitle',
]);
const isNameField = (field: string, nameFields: string[]) =>
  nameFields.includes(field) || NAME_FIELDS.has(field.toLowerCase().replace(/[_\-\s]/g, ''));
/** When a record has none of those: a field whose name ends in name or title (HotelName, itemTitle). */
const LOOSE_NAME_FIELD = /(name|title)$/i;
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

type Entry = [string, string | number];

function scalarEntries(fields: Record<string, unknown> | undefined): Entry[] {
  return Object.entries(fields ?? {}).filter(
    (entry): entry is Entry => typeof entry[1] === 'string' || typeof entry[1] === 'number',
  );
}

/** A record's own fields: those that aren't about a related item (brand, category, ...). */
function ownEntries(entries: Entry[]): Entry[] {
  return entries.filter(([name]) => !RELATED_FIELD.test(name));
}

/** Whether the record's id, or one of its identifier fields, is the requested value. */
function isIdentifiedBy(wanted: string, hitId: string | undefined, own: Entry[]): boolean {
  if (hitId !== undefined && normalize(String(hitId)) === wanted) return true;
  return own.some(([name, value]) => IDENTIFIER_FIELD.test(name) && normalize(String(value)) === wanted);
}

/** The words of a record's brand, which a request often puts next to the name. */
function brandWordsOf(entries: Entry[]): Set<string> {
  return new Set(
    entries
      .filter(([name]) => BRAND_FIELD.test(name) && !IDENTIFIER_FIELD.test(name))
      .flatMap(([, value]) => wordsOf(String(value))),
  );
}

/** A record's name fields: its known ones, or, if it has none, fields ending in name/title. */
function nameEntries(own: Entry[], nameFields: string[]): Entry[] {
  const known = own.filter(([name]) => isNameField(name, nameFields));
  return known.length > 0 ? known : own.filter(([name]) => LOOSE_NAME_FIELD.test(name));
}

/**
 * Whether a search hit is the record that was asked for:
 * - its id or an identifier field equals the requested value, or
 * - its name/title (with its brand) has every requested word and the request is more than
 *   the brand ("Crew Neck Sweater" finds "Vesper & Co Crew Neck Sweater"; "Haven & Hart
 *   Denim Jacket" finds "Streetwear Denim Jacket" by Haven & Hart), or
 * - every word of its name and brand is in the request, and the name makes up at
 *   least half of it ("Casual Crew Neck Sweater by Vesper & Co", "... Sweater in tan").
 * Plurals count as the same word. "Haven & Hart Denim Bomber" does not find
 * "Haven & Hart Streetwear Denim Jacket"; "XYZ-999" finds nothing.
 */
export function matchesRequestedRecord(
  requested: string,
  hitId: string | undefined,
  fields: Record<string, unknown> | undefined,
  nameFields: string[] = [],
): boolean {
  const wanted = normalize(requested);
  if (!wanted) return false;

  const entries = scalarEntries(fields);
  const own = ownEntries(entries);
  if (isIdentifiedBy(wanted, hitId, own)) return true;

  const brandWords = brandWordsOf(entries);
  const wantedWords = new Set(wordsOf(requested));

  for (const [, value] of nameEntries(own, nameFields)) {
    const nameWords = new Set(wordsOf(String(value)));
    const recordWords = new Set([...nameWords, ...brandWords]);
    const namesTheItem = [...wantedWords].some((word) => nameWords.has(word) && !brandWords.has(word));
    if (namesTheItem && [...wantedWords].every((word) => recordWords.has(word))) return true;
    if ([...recordWords].every((word) => wantedWords.has(word)) && nameWords.size * 2 >= wantedWords.size) {
      return true;
    }
  }
  return false;
}

type Hit = { id?: string; source?: Record<string, unknown> };

/** The record's name, as shown in a list of matches. */
function nameOf(hit: Hit, nameFields: string[]): string | number | undefined {
  return nameEntries(ownEntries(scalarEntries(hit.source)), nameFields)[0]?.[1];
}

/** Whether a hit is exactly the request: same id or code, or the same full name. */
function isExactMatch(requested: string, hit: Hit, nameFields: string[]): boolean {
  const wanted = normalize(requested);
  const own = ownEntries(scalarEntries(hit.source));
  return isIdentifiedBy(wanted, hit.id, own)
    || nameEntries(own, nameFields).some(([, value]) => normalize(String(value)) === wanted);
}

/**
 * The one hit that is the record asked for, or the hits when several fit: an exact match wins
 * over partial ones; two exact matches (records sharing a name) or two partial ones are several.
 */
function resolveMatch(requested: string, hits: Hit[], nameFields: string[]): { one?: Hit; several?: Hit[] } {
  const exact = hits.filter((hit) => isExactMatch(requested, hit, nameFields));
  const fitting = exact.length > 0
    ? exact
    : hits.filter((hit) => matchesRequestedRecord(requested, hit.id, hit.source, nameFields));
  if (fitting.length === 1) return { one: fitting[0] };
  return fitting.length > 1 ? { several: fitting } : {};
}

/** Several records fit the request: none is returned as the record; the caller asks which one. */
function severalMatch(requested: string, hits: Hit[], nameFields: string[]): OperationResult {
  return {
    success: true,
    data: {
      found: false,
      requested,
      message: `Several records match "${requested}". matches lists them; ask the user which one they mean.`,
      matches: hits.map((hit) => ({ id: hit.id, name: nameOf(hit, nameFields) })),
    },
  };
}

/** How many near misses a not-found lookup offers, so the answer can ask "did you mean ...?". */
const CLOSEST_MATCHES = 3;
/** Words too common to make two names alike. */
const FILLER_WORDS = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'by', 'at']);

/**
 * No record matches. That is an answer, not a failure: there is no document, so no product
 * card is shown, and the planner counts it as zero results. The search hits that were checked
 * and rejected come back as closestMatches (id and name only), so a near miss (a reworded name,
 * an extra word) isn't a dead end. Only hits whose name shares a word with the request, besides
 * the brand and filler words, count as close. They are not the item asked for.
 */
function notFound(requested: string, hits: Hit[], nameFields: string[]): OperationResult {
  const wantedWords = new Set(wordsOf(requested).filter((word) => !FILLER_WORDS.has(word)));
  const closestMatches = hits
    .map((hit) => {
      const brandWords = brandWordsOf(scalarEntries(hit.source));
      const name = nameOf(hit, nameFields);
      const close = name !== undefined
        && wordsOf(String(name)).some((word) => wantedWords.has(word) && !brandWords.has(word));
      return close ? { id: hit.id, name } : null;
    })
    .filter((match) => match !== null)
    .slice(0, CLOSEST_MATCHES);
  if (closestMatches.length === 0) {
    return { success: true, data: { found: false, requested, message: `No record matches "${requested}".` } };
  }
  return {
    success: true,
    data: {
      found: false,
      requested,
      message: `No record matches "${requested}". closestMatches lists the nearest items found;`
        + ' none of them is the item asked for.',
      closestMatches,
    },
  };
}
