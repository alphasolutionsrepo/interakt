// src/features/data-source/field-profiler.ts

/**
 * Field profiling from a document sample.
 *
 * Schema discovery reports names and types. That is not enough to plan a query against an
 * index nobody has read by hand: it cannot say that a date field is empty on most
 * documents, that a field named `type` holds a file format rather than a subject category,
 * or that a field's values are inconsistently cased. Each of those facts had to be
 * discovered by manually inspecting documents, once per index — and a planner prompt
 * written from that inspection is a solution for one index, not a product.
 *
 * Provider-agnostic on purpose: it takes documents that have already been fetched, so
 * Elasticsearch, Azure AI Search, a file store and any future provider all profile through
 * the same code and produce comparable numbers.
 *
 * Honesty rules, because this output is destined for prompts:
 *   - Nothing is extrapolated. `distinctInSample` is the count in the sample, not an
 *     estimate of index cardinality, and it is named so it cannot be read as one.
 *   - Sample values are only reported where they are meaningful. Free-text fields get a
 *     null rate but no examples: two sentences of body copy are not a value list, and
 *     offering them as one invites the planner to filter on prose.
 */

import type { DataSourceField, DataSourceFieldProfile } from '@/db/schema/data-sources.schema';

/** Documents examined when the data source does not specify. */
export const DEFAULT_PROFILE_SAMPLE_SIZE = 50;

/** Upper bound on sampleValues per field — this text ends up in prompts. */
const MAX_SAMPLE_VALUES = 10;

/** Values longer than this are prose, not identifiers, and are not offered as examples. */
const MAX_SAMPLE_VALUE_LENGTH = 60;

/**
 * A field with more distinct values than this in the sample is treated as free-form: the
 * examples would be a list of near-unique strings, which tells the planner nothing about
 * what is filterable.
 */
const MAX_DISTINCT_FOR_SAMPLE_VALUES = 25;

/**
 * Is this value absent for profiling purposes?
 *
 * An empty string, an empty array and an empty object all mean "this document has nothing
 * here", which is what matters when deciding whether a field can be relied on. Counting
 * them as present would report a field as populated when filtering on it returns nothing.
 */
function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value as object).length === 0;
  return false;
}

/**
 * Resolve a dotted field path, returning every value found along it.
 *
 * Descends into arrays of objects, which is not an edge case: a product document holds
 * `variants` as an array, and the mapping advertises `variants.sku` as a field. Stopping at
 * the array reports every such field as absent from every document — a confident, wrong
 * measurement, and the worst possible output for something feeding a prompt.
 *
 * A literal key containing dots is preferred over path traversal, since mappings are
 * allowed to declare a field named "a.b".
 */
function readPathValues(source: unknown, path: string): unknown[] {
  if (source === null || source === undefined) return [];
  if (Array.isArray(source)) return source.flatMap((element) => readPathValues(element, path));
  if (typeof source !== 'object') return [];

  const object = source as Record<string, unknown>;
  if (path in object) return [object[path]];

  const dot = path.indexOf('.');
  if (dot === -1) return [];

  const head = path.slice(0, dot);
  return head in object ? readPathValues(object[head], path.slice(dot + 1)) : [];
}

/**
 * Can this field be used in an exact-match filter?
 *
 * Example values exist to help build filters, so only fields that can carry one get them.
 * This deliberately does not key off the normalized `type`: discovery collapses
 * Elasticsearch `keyword` to "text", so keying off type would withhold examples from
 * precisely the fields that are most filterable — the same lossy-label trap that made
 * filter translation need `providerType`.
 */
function isExactMatchable(field: DataSourceField): boolean {
  if (field.isFilterable === false) return false;

  const analyzed = field.providerType === 'text' || field.providerType === 'search_as_you_type';
  return !analyzed || !!field.filterField;
}

/** Fields whose role says they hold prose, whatever the provider claims is filterable. */
function holdsProse(field: DataSourceField): boolean {
  return field.role === 'content' || field.role === 'description';
}

/**
 * Flatten a value into the scalar strings it contributes.
 *
 * Array fields hold several values per document, and each is independently filterable —
 * so a document with `tags: ['sale', 'new']` contributes two distinct values, not one
 * stringified array.
 */
function scalarStrings(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(scalarStrings);
  }
  if (value === null || value === undefined) return [];
  if (typeof value === 'object') return [];
  const text = String(value).trim();
  return text === '' ? [] : [text];
}

/** Profile one field across the sample. */
function profileField(
  field: DataSourceField,
  documents: Record<string, unknown>[],
  profiledAt: string,
): DataSourceFieldProfile {
  const values = new Set<string>();
  let emptyCount = 0;
  let anyOverLength = false;

  for (const document of documents) {
    const found = readPathValues(document, field.name);
    if (found.length === 0 || found.every(isEmpty)) {
      emptyCount++;
      continue;
    }
    for (const text of found.flatMap(scalarStrings)) {
      // Length only decides whether the value can be *shown* as an example. Excluding it
      // from the count too produced "nullRate 0, distinctInSample 0" on a populated
      // free-text field, which reads as a contradiction.
      if (text.length > MAX_SAMPLE_VALUE_LENGTH) anyOverLength = true;
      values.add(text);
    }
  }

  const profile: DataSourceFieldProfile = {
    sampleSize: documents.length,
    nullRate: documents.length === 0 ? 0 : emptyCount / documents.length,
    distinctInSample: values.size,
    profiledAt,
  };

  const tooVaried = values.size > MAX_DISTINCT_FOR_SAMPLE_VALUES;

  // Long values suppress examples even when few: one truncated sentence reads as a
  // filterable value and is not one.
  if (isExactMatchable(field) && !holdsProse(field) && !tooVaried && !anyOverLength && values.size > 0) {
    profile.sampleValues = [...values].sort().slice(0, MAX_SAMPLE_VALUES);
  }

  return profile;
}

/**
 * Attach a profile to every field, computed from the given documents.
 *
 * Returns the fields unchanged when there is nothing to measure, so a provider that could
 * not supply a sample leaves no misleading `sampleSize: 0` profiles behind.
 */
export function profileFields(
  fields: DataSourceField[],
  documents: Record<string, unknown>[],
  profiledAt: string,
): DataSourceField[] {
  if (documents.length === 0) return fields;

  return fields.map((field) => ({
    ...field,
    profile: profileField(field, documents, profiledAt),
  }));
}

/** Resolve the configured sample size, clamped to something a health check can afford. */
export function resolveSampleSize(configured: number | undefined): number {
  if (configured === undefined) return DEFAULT_PROFILE_SAMPLE_SIZE;
  if (!Number.isFinite(configured) || configured < 0) return DEFAULT_PROFILE_SAMPLE_SIZE;
  return Math.min(Math.floor(configured), 500);
}
