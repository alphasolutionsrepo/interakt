// src/features/search-experience/external-refusal.ts

/**
 * When an external engine refuses a request (400), whether the caller's filter or sort
 * is to blame. Engines answer 400 for other things too (paging past the result window,
 * a facet on a text field), so a field is blamed only when the engine's reason marks it
 * as a name: Elasticsearch writes [rating] or [name.keyword], Azure AI Search 'rating',
 * and both mark a value they couldn't read the same way ("abc", [maybe]). Bare words
 * don't count: "from + size must be..." is not about a field named size. A name or value
 * that more than one part of the request carries (a field filtered and sorted on, a value
 * in two filters) could be about any of them, so it blames none. Anything else, and any
 * engine whose wording we haven't checked, stays a failure of the source.
 */

import type { DataSourceField } from '@/db/schema/data-sources.schema';
import { ExternalSearchError } from '@/features/data-source/external-search/external-search.types';
import { leafFilters } from '@/features/search/filter-clauses';
import type { FilterClause, SearchRequest } from '@/features/search/search.types';
import { SearchError } from '@/features/search/search.types';

/** The engines whose 400 wording the matching below was checked against */
const KNOWN_WORDING = new Set(['Elasticsearch', 'Azure AI Search']);

/**
 * Elasticsearch's fixed wording around the name it reports, bracketed like a name but never
 * one from the request: "expected [true] or [false]", "which is of type [date]"
 */
const FIXED_WORDING = [/expected \[true\] or \[false\]/g, /of type \[[^\]]*\]/g];

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A name or value the engine may write back: a number only as Elasticsearch words it */
interface Clue { text: string; isValue?: boolean; numeric?: boolean }

/** A filter, sort or other use of one field, with the names and values it was sent with */
interface Part { kind: 'filter' | 'sort' | 'other'; field: string; clues: Clue[] }

/**
 * Whether the reason marks the clue: a name or text value as [x], 'x' or "x"; a number
 * only as "Value [3000000000] is out of range" or "boolean value [1]", since Elasticsearch's
 * fixed wording has bracketed numbers of its own ("less than or equal to: [10000]")
 */
function isMarked(reason: string, clue: Clue): boolean {
  const t = escape(clue.text);
  return clue.numeric
    ? new RegExp(`value \\[${t}\\]`, 'i').test(reason)
    : new RegExp(`\\[${t}\\]|'${t}'|"${t}"`).test(reason);
}

function valueClues(clause: FilterClause): Clue[] {
  const value = clause.value;
  const all = Array.isArray(value) ? value : typeof value === 'object' && value ? [value.from, value.to] : [value];
  return all.flatMap((v): Clue[] => {
    if (typeof v === 'number') return [{ text: String(v), isValue: true, numeric: true }];
    return typeof v === 'string' || typeof v === 'boolean' ? [{ text: String(v), isValue: true }] : [];
  });
}

/** The 400 to answer when the engine's reason blames the request's filter or sort */
export function refusedRequest(error: unknown, request: SearchRequest, fields: DataSourceField[]): SearchError | undefined {
  if (!(error instanceof ExternalSearchError) || error.status !== 400 || !KNOWN_WORDING.has(error.provider)) return undefined;
  const reason = FIXED_WORDING.reduce((text, words) => text.replace(words, ''), error.message);

  // The engine names a field as it was sent: the schema's filterField when there is one
  const names = (name: string): Clue[] =>
    [name, fields.find((f) => f.name === name)?.filterField].filter((t): t is string => !!t).map((text) => ({ text }));
  const parts: Part[] = [];
  const add = (kind: Part['kind'], field: string, clues: Clue[]) => {
    const part = parts.find((p) => p.kind === kind && p.field === field);
    if (part) part.clues.push(...clues);
    else parts.push({ kind, field, clues });
  };
  for (const f of leafFilters(request.filters)) add('filter', f.field, [...names(f.field), ...valueClues(f)]);
  for (const s of request.sort ?? []) add('sort', s.field, names(s.field));
  // Facets and returned fields are sent under the same names, and can be what was refused;
  // so is the query text, searched in every searchable field
  for (const field of [...(request.facets ?? []).map((f) => f.field), ...(request.includeFields ?? [])]) add('other', field, names(field));
  if (request.query) add('other', '', [{ text: request.query }]);

  // A name or value that several parts carry could be about any of them: blame none
  const carriers = new Map<string, number>();
  for (const part of parts) {
    for (const text of new Set(part.clues.map((c) => c.text))) carriers.set(text, (carriers.get(text) ?? 0) + 1);
  }
  // Each part the reason blames, with the value it couldn't read when that's what it named
  const blamed = (kind: Part['kind']): Blamed[] => parts.flatMap((p) => {
    if (p.kind !== kind) return [];
    const marked = p.clues.filter((c) => carriers.get(c.text) === 1 && isMarked(reason, c));
    if (marked.length === 0) return [];
    const value = marked.find((c) => c.isValue)?.text;
    return [{ field: p.field, ...(value !== undefined && { value }) }];
  });
  const filters = blamed('filter');
  const sorts = blamed('sort').map((b) => b.field);
  if (filters.length === 0 && sorts.length === 0) return undefined;
  const code = filters.length > 0 && sorts.length > 0 ? 'INVALID_QUERY' : filters.length > 0 ? 'INVALID_FILTER' : 'INVALID_SORT';
  return new SearchError(refusalMessage(filters, sorts), code, { fields: [...filters.map((f) => f.field), ...sorts] }, { cause: error });
}

interface Blamed { field: string; value?: string }

const MAX_VALUE_LENGTH = 40;

/**
 * What to tell the caller: the value it sent, when that's what the engine couldn't read
 * ("abc" isn't a valid value for rating), else the field it can't filter or sort on
 */
function refusalMessage(filters: Blamed[], sorts: string[]): string {
  const quote = (value: string) => `"${value.length > MAX_VALUE_LENGTH ? `${value.slice(0, MAX_VALUE_LENGTH)}…` : value}"`;
  const byValue = filters.filter((f) => f.value !== undefined).map((f) => `${quote(f.value!)} isn't a valid value for ${f.field}`);
  const byField = filters.filter((f) => f.value === undefined).map((f) => f.field);
  const cannot = [
    ...(byField.length > 0 ? [`filter on ${byField.join(', ')}`] : []),
    ...(sorts.length > 0 ? [`sort on ${sorts.join(', ')}`] : []),
  ];
  const message = [...byValue, ...(cannot.length > 0 ? [`this search source can't ${cannot.join(' or ')}`] : [])].join('; ');
  return message.charAt(0).toUpperCase() + message.slice(1);
}
