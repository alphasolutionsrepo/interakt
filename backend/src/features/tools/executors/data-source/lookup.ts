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
  noRecordFound,
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

    // A numeric id (a SKU typed as a number) is looked up as text
    const documentId = lookupInput.id === undefined || lookupInput.id === null ? '' : String(lookupInput.id);
    if (!documentId) {
      return { success: false, error: 'An "id" parameter is required to look up a document' };
    }

    const source = await resolveDataSource(dataSourceId);

    // The branches below are returned, not awaited: an engine error rejects and reaches
    // executeTool, which retries transient errors and labels the call failed.
    if (source.kind === 'file_store') return executeFileStoreLookup(dataSourceId, config, input);

    // Managed indexes fetch by document key — provider-agnostic (ES _id / Azure key).
    if (source.kind === 'managed') {
      return lookupFromManagedIndex(source.searchIndexId, documentId, () => loadSchema(dataSourceId));
    }

    // External sources still look up via a filterable id field.
    const schema = await loadSchema(dataSourceId);
    const fields = schema?.fields ?? [];
    const roles = rolesOf(schema);
    const idField = lookupConfig.idField ?? resolveIdField(fields);
    return lookupFromExternalSource(source, idField, documentId, fields, roles);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Data source lookup failed', error as Error, { dataSourceId });
    return { success: false, error: message };
  }
}

// ============================================================================
// ID FIELD RESOLUTION
// ============================================================================

/** The data source's schema; none when it has no schema or can't be read. */
async function loadSchema(dataSourceId: string): Promise<DataSourceSchema | null> {
  try {
    const ds = await dataSourceService.getDataSourceById(dataSourceId);
    return (ds?.schema as DataSourceSchema | null) ?? null;
  } catch (error) {
    // Non-critical: the lookup still works without roles (id field 'id', exact name fields)
    logger.warn('Could not read the data source schema for a lookup', {
      dataSourceId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/** The fields the schema says name and identify a record, and whether an admin confirmed them. */
function rolesOf(schema: DataSourceSchema | null): FieldRoles {
  const fields = schema?.fields ?? [];
  return {
    titleFields: fields.filter((f) => f.role === 'title').map((f) => f.name),
    idFields: fields.filter((f) => f.role === 'id').map((f) => f.name),
    confirmed: schema?.rolesConfirmed === true,
  };
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
  loadSchemaOnMiss: () => Promise<DataSourceSchema | null>,
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
  // Read only now: a key that exists needs no schema
  const schema = await loadSchemaOnMiss();
  const roles = rolesOf(schema);
  // Ask for every field but vectors, not only those responses show, so a sku or name kept out
  // of responses can still be matched; the record itself is then fetched as responses show it.
  const matchFields = (schema?.fields ?? []).filter((f) => f.type !== 'vector').map((f) => f.name);
  const includeFields = matchFields.length > 0 ? matchFields : undefined;
  const response = await searchService.searchById(
    searchIndexId,
    { query: documentId, pageSize: FALLBACK_CANDIDATES, ...(includeFields && { includeFields }) },
    { triggerType: 'ai_tool' },
  );
  const resolved = resolveMatch(documentId, response.hits, roles);
  if (resolved.several) return severalMatch(documentId, resolved.several, roles);
  const match = resolved.one;
  if (match) {
    logger.info('Lookup id was not a document key — returning matching search hit', {
      searchIndexId,
      query: documentId,
      matchedId: match.id,
    });
    const shown = includeFields && match.id ? await searchService.getDocumentByIdFromIndex(searchIndexId, match.id) : null;
    if (includeFields && !shown) return noRecordFound(documentId);
    return {
      success: true,
      data: {
        id: match.id,
        document: shown ? shown.fields : match.source,
        matchedBy: 'search_fallback',
      },
    };
  }

  return notFound(documentId, response.hits, roles);
}

// ============================================================================
// EXTERNAL SOURCE LOOKUP
// ============================================================================

async function lookupFromExternalSource(
  source: ResolvedExternalSource,
  idField: string,
  documentId: string,
  fields: DataSourceField[],
  roles: FieldRoles,
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
  const resolved = resolveMatch(documentId, searched.hits, roles);
  if (resolved.several) return severalMatch(documentId, resolved.several, roles);
  const match = resolved.one;
  if (match) {
    logger.info('External lookup id did not match — returning matching search hit', {
      dataSourceId: source.dataSourceId,
      query: documentId,
      matchedId: match.id,
    });
    return { success: true, data: { id: match.id, document: match.source, matchedBy: 'search_fallback' } };
  }

  return notFound(documentId, searched.hits, roles);
}

// ============================================================================
// SEARCH FALLBACK MATCHING
// ============================================================================

/** How many search hits the fallback checks for the record asked for. */
const FALLBACK_CANDIDATES = 5;

/** Fields that identify a record exactly: id, sku, productCode, item_number, ... */
const IDENTIFIER_FIELD = /(^|_|-)(id|sku|code|key|slug|handle|number|ref|ean|upc|gtin|mpn)$|(Id|ID|Sku|SKU|Code|Key|Slug|Handle|Number|Ref)$/;
/**
 * Guessed name fields, for a record whose schema declares none: exact names, so colorName or
 * fileName don't count as the record's name.
 */
const NAME_FIELDS = new Set([
  'name', 'title', 'label', 'heading', 'displayname', 'productname', 'producttitle', 'itemname',
  'documenttitle', 'pagetitle',
]);
const isNameField = (field: string) => NAME_FIELDS.has(field.toLowerCase().replace(/[_\-\s]/g, ''));
/** When a record has none of those: a field whose name ends in name or title (HotelName, itemTitle). */
const LOOSE_NAME_FIELD = /(name|title)$/i;
/** Fields about a related item (brandName, categoryId, ...), which don't identify this record. */
const RELATED_FIELD = /brand|category|categories|vendor|manufacturer|supplier|seller|parent|collection|store|author|related/i;
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

/** Words too common to tell two names apart ("the", "of", ...). */
const FILLER_WORDS = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'by', 'at']);

/** The words that carry meaning, so "the crew neck sweater" compares like "crew neck sweater". */
function contentWords(text: string): string[] {
  return wordsOf(text).filter((word) => !FILLER_WORDS.has(word));
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

const isScalar = (value: unknown): value is string | number => typeof value === 'string' || typeof value === 'number';

/**
 * Which fields name and identify a record, from the data source's schema: the fields with the
 * 'title' role (one or more; read together as one name) and the 'id' role. Until an admin
 * confirms them (`rolesConfirmed`), the lookup also falls back to guessing from field names,
 * so sources set up before roles could be confirmed keep working.
 */
export interface FieldRoles {
  titleFields?: string[];
  idFields?: string[];
  confirmed?: boolean;
}

/** The values at a field path ("name", "variants.sku"), across lists. */
function valuesAt(source: Record<string, unknown> | undefined, path: string): Array<string | number> {
  let current: unknown[] = [source];
  for (const key of path.split('.')) {
    current = current
      .flatMap((value) => (Array.isArray(value) ? value : [value]))
      .map((value) => (value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined));
  }
  return current.flatMap((value) => (Array.isArray(value) ? value : [value])).filter(isScalar);
}

/**
 * How surely a code identifies its record, strongest first: the record's own key, a declared id
 * field, a field on the record named like an identifier (sku, productCode), the same inside a
 * list (variants[].sku), and any other text with a digit in it (isbn, partNo, but also
 * compatibleWith: "iPhone 15"), which only might be a code: it is offered, never returned.
 */
const CODE = { key: 4, declared: 3, field: 2, listed: 1, possible: 0, none: -1 } as const;

/**
 * The record's codes and how surely each identifies it. Declared id fields always count; until
 * roles are confirmed, so do guessed ones. A plain number (price, reviewCount) is never guessed
 * to be a code, and fields about a related item don't count.
 */
function codeValues(
  source: Record<string, unknown> | undefined,
  roles: FieldRoles,
): Array<{ value: string | number; strength: number }> {
  const codes: Array<{ value: string | number; strength: number }> = (roles.idFields ?? [])
    .flatMap((field) => valuesAt(source, field))
    .map((value) => ({ value, strength: CODE.declared }));
  if (roles.confirmed) return codes;

  const add = (field: string, value: unknown, inList: boolean) => {
    if (!isScalar(value)) return;
    if (IDENTIFIER_FIELD.test(field)) codes.push({ value, strength: inList ? CODE.listed : CODE.field });
    else if (typeof value === 'string' && /\d/.test(value)) codes.push({ value, strength: CODE.possible });
  };
  for (const [field, value] of Object.entries(source ?? {})) {
    if (RELATED_FIELD.test(field)) continue;
    if (!Array.isArray(value)) {
      add(field, value, false);
      continue;
    }
    for (const item of value) {
      if (item && typeof item === 'object') Object.entries(item).forEach(([key, inner]) => add(key, inner, true));
      else add(field, item, true);
    }
  }
  return codes;
}

/** How surely the requested value identifies the record (CODE.none when it isn't one of its codes). */
function codeStrength(
  wanted: string,
  hitId: string | undefined,
  source: Record<string, unknown> | undefined,
  roles: FieldRoles,
): number {
  if (hitId !== undefined && normalize(String(hitId)) === wanted) return CODE.key;
  return codeValues(source, roles)
    .filter((code) => normalize(String(code.value)) === wanted)
    .reduce((best, code) => Math.max(best, code.strength), CODE.none);
}

/**
 * The words of a record's brand, which a request often puts next to the name. Guessed from
 * field names until roles are confirmed; after that a brand counts only as part of the title.
 */
function brandWordsOf(source: Record<string, unknown> | undefined, roles: FieldRoles): Set<string> {
  if (roles.confirmed) return new Set();
  return new Set(
    scalarEntries(source)
      .filter(([name]) => BRAND_FIELD.test(name) && !IDENTIFIER_FIELD.test(name))
      .flatMap(([, value]) => wordsOf(String(value))),
  );
}

/**
 * The record's names. Its declared title fields read together as one name ("Robert Martin" and
 * "Clean Architecture"). Without them, and only until roles are confirmed, the first of: its own
 * known name fields, its own fields ending in name/title, and, for a record that is itself a
 * store, brand or author, any such field.
 */
function namesOf(source: Record<string, unknown> | undefined, roles: FieldRoles): string[] {
  const declared = declaredTitleValues(source, roles);
  if (declared.length > 0) return [declared.join(' ')];
  if (roles.confirmed) return [];

  const entries = scalarEntries(source);
  const own = ownEntries(entries);
  for (const pick of [
    own.filter(([name]) => isNameField(name)),
    own.filter(([name]) => LOOSE_NAME_FIELD.test(name)),
    entries.filter(([name]) => LOOSE_NAME_FIELD.test(name)),
  ]) {
    if (pick.length > 0) return pick.map(([, value]) => String(value));
  }
  return [];
}

function declaredTitleValues(source: Record<string, unknown> | undefined, roles: FieldRoles): string[] {
  return (roles.titleFields ?? []).flatMap((field) => valuesAt(source, field)).map(String);
}

/**
 * Whether a search hit is the record that was asked for:
 * - its id or one of its certain codes equals the requested value (a value that only might be
 *   a code, such as compatibleWith: "iPhone 15", is offered as a near miss instead), or
 * - its name (with its brand) has every requested word and the request is more than
 *   the brand ("Crew Neck Sweater" finds "Vesper & Co Crew Neck Sweater"; "Haven & Hart
 *   Denim Jacket" finds "Streetwear Denim Jacket" by Haven & Hart), or
 * - every word of its name and brand is in the request, and the name makes up at
 *   least half of it ("Casual Crew Neck Sweater by Vesper & Co", "... Sweater in tan").
 * Plurals and filler words don't count. "Haven & Hart Denim Bomber" does not find
 * "Haven & Hart Streetwear Denim Jacket"; "XYZ-999" finds nothing.
 */
export function matchesRequestedRecord(
  requested: string,
  hitId: string | undefined,
  fields: Record<string, unknown> | undefined,
  roles: FieldRoles = {},
): boolean {
  const wanted = normalize(requested);
  if (!wanted) return false;

  if (codeStrength(wanted, hitId, fields, roles) > CODE.possible) return true;

  const brandWords = brandWordsOf(fields, roles);
  const wantedWords = new Set(contentWords(requested));

  for (const name of namesOf(fields, roles)) {
    const nameWords = new Set(contentWords(name));
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
function nameOf(hit: Hit, roles: FieldRoles): string | undefined {
  return namesOf(hit.source, roles)[0];
}

/**
 * How exactly a hit is the request: by a code (see CODE), or by its full name (the whole name, or
 * one declared title field on its own), which counts like an identifier field on the record.
 */
function exactStrength(requested: string, hit: Hit, roles: FieldRoles): number {
  const wanted = normalize(requested);
  const byName = [...namesOf(hit.source, roles), ...declaredTitleValues(hit.source, roles)]
    .some((name) => normalize(name) === wanted);
  return Math.max(codeStrength(wanted, hit.id, hit.source, roles), byName ? CODE.field : CODE.none);
}

/**
 * The one hit that is the record asked for, or the hits when several fit. The most exact match
 * wins (the record's key, then a declared id, then its own sku or full name, then a sku in its
 * list of variants); a tie is several. With no exact match, partial name matches: one is the
 * record, two or more are several.
 */
function resolveMatch(requested: string, hits: Hit[], roles: FieldRoles): { one?: Hit; several?: Hit[] } {
  const strengths = hits.map((hit) => exactStrength(requested, hit, roles));
  const best = Math.max(CODE.none, ...strengths);
  const exact = best > CODE.possible ? hits.filter((_, i) => strengths[i] === best) : [];
  const fitting = exact.length > 0
    ? exact
    : hits.filter((hit) => matchesRequestedRecord(requested, hit.id, hit.source, roles));
  if (fitting.length === 1) return { one: fitting[0] };
  return fitting.length > 1 ? { several: fitting } : {};
}

/** Several records fit the request: none is returned as the record; the caller asks which one. */
function severalMatch(requested: string, hits: Hit[], roles: FieldRoles): OperationResult {
  return {
    success: true,
    data: {
      found: false,
      requested,
      message: `Several records match "${requested}". matches lists them; ask the user which one they mean.`,
      matches: hits.map((hit) => ({ id: hit.id, name: nameOf(hit, roles) })),
    },
  };
}

/** How many near misses a not-found lookup offers, so the answer can ask "did you mean ...?". */
const CLOSEST_MATCHES = 3;

/**
 * No record matches. That is an answer, not a failure: there is no document, so no product
 * card is shown, and the planner counts it as zero results. The search hits that were checked
 * and rejected come back as closestMatches (id and name only), so a near miss (a reworded name,
 * an extra word, a value it only mentions) isn't a dead end. Hits that hold the value in a field
 * not known to hold codes come first, then hits whose name shares a word with the request,
 * besides the brand and filler words. They are not the item asked for.
 */
function notFound(requested: string, hits: Hit[], roles: FieldRoles): OperationResult {
  const wanted = normalize(requested);
  const wantedWords = new Set(contentWords(requested));
  const sharesAWord = (hit: Hit) => {
    const brandWords = brandWordsOf(hit.source, roles);
    const name = nameOf(hit, roles);
    return name !== undefined && wordsOf(name).some((word) => wantedWords.has(word) && !brandWords.has(word));
  };
  // Hits that hold the value as a possible code come first, then those that share a word
  const mentions = hits.filter((hit) => codeStrength(wanted, hit.id, hit.source, roles) > CODE.none);
  const closestMatches = [...mentions, ...hits.filter((hit) => !mentions.includes(hit) && sharesAWord(hit))]
    .slice(0, CLOSEST_MATCHES)
    .map((hit) => ({ id: hit.id, name: nameOf(hit, roles) }));
  if (closestMatches.length === 0) return noRecordFound(requested);
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
