// src/features/data-source/external-search/connectors/content-hub.request.ts

/**
 * Sitecore Content Hub — filter and sort translation
 *
 * Pure functions between Interakt filter clauses and SearchAfter V2's structured
 * filters. Values that need a lookup on the tenant (a taxonomy item named "Cabinets",
 * an option-list value labelled "Active") are resolved through a resolver the caller
 * supplies, so the translation itself stays free of I/O and unit-testable.
 *
 * What SearchAfter can express, by field kind (from the field's providerType):
 *   Relation:<def>     eq/neq/in/nin by entity id, or by label resolved to ids
 *   String, OptionList eq/neq/in/nin/contains/prefix; option-list labels resolve to identifiers
 *   DateTime           eq/gt/gte/lt/lte/range
 *   System id          eq/in (IdIn)
 *   and/or/not         nested
 * Anything else (numbers, booleans, exists/missing, identifier) is reported as unapplied:
 * SearchAfter silently ignores filter types it does not support, so a clause that cannot be
 * translated must never be sent as a guess.
 */

import type { ExternalConnection, UnappliedClause } from '../external-search.types';

import { andFilters, orFilters, type ContentHubFilter } from './content-hub.client';

import type { DataSourceField } from '@/db/schema/data-sources.schema';
import type { FilterClause, RangeValue, SortClause } from '@/features/search/search.types';



// ============================================================================
// FIELD KINDS
// ============================================================================

export type ContentHubFieldKind =
  | { kind: 'id' }
  | { kind: 'system'; sortField: string }
  | { kind: 'relation'; target: string }
  | { kind: 'optionList'; list: string }
  | { kind: 'string' }
  | { kind: 'date' }
  | { kind: 'other'; providerType: string };

const SYSTEM_SORT: Record<string, string> = { identifier: 'identifier', created_on: 'createdon', modified_on: 'modifiedon' };

/** What a field is to Content Hub, read from the providerType discovery stored. */
export function fieldKind(field: DataSourceField | undefined, name: string): ContentHubFieldKind {
  if (name === 'id') return { kind: 'id' };
  if (name in SYSTEM_SORT) return { kind: 'system', sortField: SYSTEM_SORT[name] };
  const providerType = field?.providerType ?? '';
  if (providerType.startsWith('Relation')) {
    return { kind: 'relation', target: providerType.slice(providerType.indexOf(':') + 1) };
  }
  if (providerType.includes(':OptionList')) {
    const list = field?.description?.match(/^Option list (.+)$/)?.[1] ?? name;
    return { kind: 'optionList', list };
  }
  if (providerType.startsWith('String')) return { kind: 'string' };
  if (providerType.startsWith('DateTime') || providerType.startsWith('Date')) return { kind: 'date' };
  if (!field) return { kind: 'string' };
  return { kind: 'other', providerType };
}

// ============================================================================
// RESOLUTION
// ============================================================================

/**
 * Looks values up on the tenant. Returns the ids (relation) or identifiers (option list)
 * a value stands for; an empty list means nothing matched.
 */
export interface ContentHubResolver {
  relationIds(targetDefinition: string, value: unknown): Promise<number[]>;
  optionIdentifiers(list: string, value: unknown): Promise<string[]>;
}

export interface TranslatedContentHubFilters {
  filter?: ContentHubFilter;
  unapplied: UnappliedClause[];
}

function values(clause: FilterClause): unknown[] {
  return Array.isArray(clause.value) ? clause.value : [clause.value];
}

function asId(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim());
  return undefined;
}

function asText(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return undefined;
}

function asDate(value: unknown): string | undefined {
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

const DATE_OPERATORS: Record<string, 'GreaterThan' | 'GreaterThanOrEqual' | 'LessThan' | 'LessThanOrEqual' | 'Equals'> = {
  gt: 'GreaterThan', gte: 'GreaterThanOrEqual', lt: 'LessThan', lte: 'LessThanOrEqual', eq: 'Equals',
};

function negate(filter: ContentHubFilter | undefined): ContentHubFilter | undefined {
  return filter ? { type: 'Negating', query: filter } : undefined;
}

class Untranslatable extends Error {}

/**
 * Translate one clause. Throws Untranslatable with the reason when SearchAfter cannot
 * express it or a value resolves to nothing.
 */
async function translateClause(
  clause: FilterClause,
  fields: Map<string, DataSourceField>,
  resolver: ContentHubResolver,
): Promise<ContentHubFilter> {
  const op = clause.operator;

  if (op === 'and' || op === 'or' || op === 'not') {
    const parts: ContentHubFilter[] = [];
    for (const inner of clause.filters ?? []) parts.push(await translateClause(inner, fields, resolver));
    if (parts.length === 0) throw new Untranslatable(`'${op}' has no clauses`);
    if (op === 'not') return { type: 'Negating', query: parts.length === 1 ? parts[0] : andAll(parts) };
    return op === 'and' ? andAll(parts) : orFilters(parts)!;
  }

  const name = clause.field;
  const field = fields.get(name);
  const kind = fieldKind(field, name);

  switch (kind.kind) {
    case 'id': {
      if (op !== 'eq' && op !== 'in' && op !== 'neq' && op !== 'nin') throw new Untranslatable(`'${op}' is not supported on id`);
      const ids = values(clause).map(asId).filter((v): v is number => v !== undefined);
      if (ids.length === 0) throw new Untranslatable('id values must be entity ids');
      const filter: ContentHubFilter = { type: 'IdIn', ids };
      return op === 'neq' || op === 'nin' ? negate(filter)! : filter;
    }

    case 'relation': {
      if (!['eq', 'neq', 'in', 'nin'].includes(op)) throw new Untranslatable(`'${op}' is not supported on relation ${name}`);
      const ids: number[] = [];
      for (const value of values(clause)) {
        const id = asId(value);
        if (id !== undefined) { ids.push(id); continue; }
        const resolved = await resolver.relationIds(kind.target, value);
        if (resolved.length === 0) throw new Untranslatable(`no ${kind.target} item named "${String(value)}"`);
        ids.push(...resolved);
      }
      const filter = orFilters([...new Set(ids)].map((id) => ({ type: 'Relation', relation: name, id } as ContentHubFilter)))!;
      return op === 'neq' || op === 'nin' ? negate(filter)! : filter;
    }

    case 'optionList':
    case 'string': {
      if (op === 'contains' || op === 'prefix') {
        const text = asText(clause.value);
        if (text === undefined) throw new Untranslatable(`'${op}' needs a text value`);
        return { type: 'StringProperty', property_name: name, operator: op === 'contains' ? 'Contains' : 'StartsWith', value: text };
      }
      if (!['eq', 'neq', 'in', 'nin'].includes(op)) throw new Untranslatable(`'${op}' is not supported on ${name}`);
      const texts: string[] = [];
      for (const value of values(clause)) {
        const text = asText(value);
        if (text === undefined) throw new Untranslatable(`${name} needs text values`);
        if (kind.kind === 'optionList') {
          const identifiers = await resolver.optionIdentifiers(kind.list, text);
          texts.push(...(identifiers.length ? identifiers : [text]));
        } else {
          texts.push(text);
        }
      }
      const filter = orFilters([...new Set(texts)].map((value) => ({ type: 'StringProperty', property_name: name, operator: 'Equals', value } as ContentHubFilter)))!;
      return op === 'neq' || op === 'nin' ? negate(filter)! : filter;
    }

    case 'date': {
      if (op === 'range') {
        const range = (clause.value ?? {}) as RangeValue;
        const parts: ContentHubFilter[] = [];
        const from = asDate(range.from);
        const to = asDate(range.to);
        if (from) parts.push({ type: 'DateTimeProperty', property_name: name, operator: range.includeLower === false ? 'GreaterThan' : 'GreaterThanOrEqual', value: from });
        if (to) parts.push({ type: 'DateTimeProperty', property_name: name, operator: range.includeUpper === false ? 'LessThan' : 'LessThanOrEqual', value: to });
        if (parts.length === 0) throw new Untranslatable(`range on ${name} has no bounds`);
        return andAll(parts);
      }
      const operator = DATE_OPERATORS[op];
      if (!operator) throw new Untranslatable(`'${op}' is not supported on date ${name}`);
      const date = asDate(clause.value);
      if (!date) throw new Untranslatable(`${name} needs a date value`);
      return { type: 'DateTimeProperty', property_name: name, operator, value: date };
    }

    case 'system':
      throw new Untranslatable(`${name} can be sorted on but not filtered`);

    default:
      throw new Untranslatable(`Content Hub cannot filter on ${name} (${kind.providerType})`);
  }
}

function andAll(parts: ContentHubFilter[]): ContentHubFilter {
  return parts.reduce<ContentHubFilter | undefined>((acc, part) => andFilters(acc, part), undefined)!;
}

/**
 * Translate filter clauses to one SearchAfter filter (ANDed). Clauses that cannot be
 * expressed are left out and reported, never guessed.
 */
export async function translateContentHubFilters(
  clauses: FilterClause[] | undefined,
  fields: DataSourceField[] | undefined,
  resolver: ContentHubResolver,
): Promise<TranslatedContentHubFilters> {
  const byName = new Map((fields ?? []).map((f) => [f.name, f]));
  const unapplied: UnappliedClause[] = [];
  let filter: ContentHubFilter | undefined;
  for (const clause of clauses ?? []) {
    try {
      filter = andFilters(filter, await translateClause(clause, byName, resolver));
    } catch (error) {
      if (!(error instanceof Untranslatable)) throw error;
      unapplied.push({ field: clause.field, operator: clause.operator, reason: error.message });
    }
  }
  return { filter, unapplied };
}

// ============================================================================
// FULL TEXT
// ============================================================================

/** Words that say what is being searched rather than which one: never useful as full text. */
const GENERIC_WORDS = new Set([
  'a', 'an', 'the', 'of', 'for', 'in', 'on', 'with', 'and', 'or', 'to', 'from', 'by', 'all', 'any', 'some',
  'find', 'show', 'list', 'get', 'search', 'me', 'us', 'please',
  'item', 'items', 'result', 'results', 'entity', 'entities', 'record', 'records',
]);

/**
 * Content Hub's full text matches entities containing all the words, in the order given, so a
 * query is sent as one filter per word (order no longer matters) after dropping generic
 * words and the definition's own name ("products" on a product source adds nothing but
 * excludes everything that never says "product").
 */
export function queryWords(query: string, definitionNames: string[] = []): string[] {
  const generic = new Set(GENERIC_WORDS);
  for (const name of definitionNames) {
    for (const token of name.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
      if (!token) continue;
      generic.add(token);
      generic.add(token.endsWith('s') ? token.slice(0, -1) : `${token}s`);
    }
  }
  const seen = new Set<string>();
  const words: string[] = [];
  for (const raw of query.split(/\s+/)) {
    const word = raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
    if (!word || word === '*') continue;
    const key = word.toLowerCase();
    if (generic.has(key) || seen.has(key)) continue;
    seen.add(key);
    words.push(word);
  }
  return words;
}

/** One FullText filter per word, ANDed; none for no words. */
export function fullTextFilter(words: string[]): ContentHubFilter | undefined {
  return words.reduce<ContentHubFilter | undefined>((acc, word) => andFilters(acc, { type: 'FullText', value: word, operator: 'Equals' }), undefined);
}

// ============================================================================
// SORT
// ============================================================================

export interface TranslatedContentHubSort {
  sorting: Array<{ field: string; order: 'Asc' | 'Desc' }>;
  unapplied: UnappliedClause[];
}

/**
 * Sort clauses → SearchAfter sorting. System fields map to Content Hub's names; properties
 * sort by their own name. Relations cannot be sorted on. `identifier` is always appended
 * as the tie-breaker SearchAfter needs for stable cursors.
 */
export function translateContentHubSort(clauses: SortClause[] | undefined, fields: DataSourceField[] | undefined): TranslatedContentHubSort {
  const byName = new Map((fields ?? []).map((f) => [f.name, f]));
  const sorting: TranslatedContentHubSort['sorting'] = [];
  const unapplied: UnappliedClause[] = [];
  for (const clause of clauses ?? []) {
    const kind = fieldKind(byName.get(clause.field), clause.field);
    const order = clause.direction === 'desc' ? 'Desc' : 'Asc';
    if (kind.kind === 'id') sorting.push({ field: 'id', order });
    else if (kind.kind === 'system') sorting.push({ field: kind.sortField, order });
    else if (kind.kind === 'relation') unapplied.push({ field: clause.field, reason: 'relations cannot be sorted on' });
    else if (kind.kind === 'other') unapplied.push({ field: clause.field, reason: `cannot sort on ${kind.providerType}` });
    else sorting.push({ field: clause.field, order });
  }
  if (!sorting.some((s) => s.field === 'identifier')) sorting.push({ field: 'identifier', order: 'Asc' });
  return { sorting, unapplied };
}

// ============================================================================
// FIXED FILTERS
// ============================================================================

/** The filters a Content Hub source carries on every query, from its provider settings. */
export function contentHubFixedFilters(connection: ExternalConnection): FilterClause[] {
  const fixed = connection.providerSettings?.fixedFilters;
  return Array.isArray(fixed) ? (fixed as FilterClause[]) : [];
}
