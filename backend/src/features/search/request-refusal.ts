// src/features/search/request-refusal.ts

/**
 * When a search engine refuses a request (400), whether the caller's filter or sort is to
 * blame, and what to tell them. Engines answer 400 for other things too (paging past the
 * result window, a facet on a text field), so a field is blamed only when the engine's
 * reason marks it as a name: Elasticsearch writes [rating] or [name.keyword], Azure AI
 * Search 'rating', and both mark a value they couldn't read the same way ("abc", [maybe]).
 * Bare words don't count: "from + size must be..." is not about a field named size. A
 * name or value that more than one part of the request carries (a field filtered and
 * sorted on, a value in two filters) could be about any of them, so it blames none.
 * Paging past Elasticsearch's result window is the caller's too, and says so.
 */

import { leafFilters } from './filter-clauses';
import type { FilterClause, SearchRequest } from './search.types';
import { SearchError } from './search.types';


/**
 * Elasticsearch's fixed wording, bracketed like a name but never one from the request:
 * "expected [true] or [false]", "which is of type [date]", "less than or equal to: [10000]
 * but was [10020]"
 */
const FIXED_WORDING = [
    /expected \[true\] or \[false\]/g,
    /of type \[[^\]]*\]/g,
    /less than or equal to: \[\d+\] but was \[\d+\]/g,
];

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A name or value the engine may write back: a number only as Elasticsearch words it */
interface Clue { text: string; isValue?: boolean; numeric?: boolean }

/** A filter, sort or other use of one field, with the names and values it was sent with */
interface Part { kind: 'filter' | 'sort' | 'other'; field: string; clues: Clue[] }

/**
 * Whether the reason marks the clue: a name or text value as [x], 'x' or "x"; a number
 * only as "Value [3000000000] is out of range", "boolean value [1]" or Sitecore's "filter
 * value '80' not of the expected type", since Elasticsearch's fixed wording has bracketed
 * numbers of its own ("less than or equal to: [10000]")
 */
function isMarked(reason: string, clue: Clue): boolean {
    const t = escape(clue.text);
    return clue.numeric
        ? new RegExp(`value \\[${t}\\]|value '${t}'`, 'i').test(reason)
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

/**
 * The 400 to answer when the engine's reason blames the request's filter or sort, or
 * undefined when it can't be told. sentAs gives the names a field reached the engine as
 * (the field itself, a keyword sub-field); the engine names it by one of them. fixedFilters
 * are the source's own, sent with every request: the caller can't be blamed for them, and
 * a name or value they share with the caller's could be about either.
 */
export function refusalFor(
    engineReason: string,
    request: SearchRequest,
    sentAs: (field: string) => Array<string | undefined>,
    cause: unknown,
    fixedFilters: FilterClause[] = [],
): SearchError | undefined {
    const window = RESULT_WINDOW.exec(engineReason);
    if (window) return pagingRefusal(Number(window[1]), cause);
    const reason = FIXED_WORDING.reduce((text, words) => text.replace(words, ''), engineReason);
    const names = (name: string): Clue[] => sentAs(name).filter((t): t is string => !!t).map((text) => ({ text }));
    const parts: Part[] = [];
    const add = (kind: Part['kind'], field: string, clues: Clue[]) => {
        const part = parts.find((p) => p.kind === kind && p.field === field);
        if (part) part.clues.push(...clues);
        else parts.push({ kind, field, clues });
    };
    for (const f of leafFilters(request.filters)) add('filter', f.field, [...names(f.field), ...valueClues(f)]);
    for (const f of leafFilters(fixedFilters)) add('other', f.field, [...names(f.field), ...valueClues(f)]);
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
    return new SearchError(refusalMessage(filters, sorts), code, { fields: [...filters.map((f) => f.field), ...sorts] }, { cause });
}

/** Elasticsearch refusing a page past its result window: "... less than or equal to: [10000]" */
const RESULT_WINDOW = /Result window is too large, from \+ size must be less than or equal to: \[(\d+)\]/;

function pagingRefusal(maxResults: number, cause: unknown): SearchError {
    return new SearchError(
        `Results past the first ${maxResults} can't be fetched: narrow the search or ask for an earlier page`,
        'INVALID_QUERY',
        { maxResults },
        { cause },
    );
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

/**
 * How an engine's refusal (400) answers: as the caller's filter or sort to fix when its
 * reason blames one, else as a failure of the engine. That keeps the engine error as the
 * cause, so admins are told what it said (a vector size mismatch, a shard error) and
 * visitors get the plain message, as for any other engine failure.
 */
export function refusedOrFailed(
    engineReason: string,
    request: SearchRequest,
    sentAs: (field: string) => Array<string | undefined>,
    cause: unknown,
    details?: Record<string, unknown>,
): SearchError {
    return refusalFor(engineReason, request, sentAs, cause)
        ?? new SearchError(engineReason, 'PROVIDER_ERROR', details, { cause });
}
