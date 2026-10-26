// src/features/search/hidden-searched-fields.ts

/**
 * Searched fields kept out of responses, for a caller that asks for them
 * (`includeHiddenSearchedFields`) to tell why a hit matched. One owner for both engines'
 * query builders and the response step: which fields are added, and how they are taken back
 * out of each hit's source into `hiddenSearchedFields`, so source stays as responses show it.
 */

import type { SearchContext, SearchHit, SearchRequest } from './search.types';

/**
 * Whether the request gets them. Not with an explicit empty field list: the engines read that
 * differently (Elasticsearch as the default fields, Azure as every retrievable field), so the
 * request is left as it would be without the option.
 */
function wantsHiddenSearchedFields(request: SearchRequest): boolean {
    return request.includeHiddenSearchedFields === true && request.includeFields?.length !== 0;
}

/**
 * The fields to ask the engine for: the shown fields plus the searched ones, when the request
 * asks for them. With no shown fields nothing is narrowed, so there is nothing hidden to add.
 */
export function withHiddenSearchedFields(
    shownFields: string[],
    searchedFields: string[],
    request: SearchRequest,
): string[] {
    if (!wantsHiddenSearchedFields(request) || shownFields.length === 0) return shownFields;
    return [...new Set([...shownFields, ...searchedFields])];
}

/**
 * Move the searched fields kept out of responses from each hit's source to
 * hiddenSearchedFields, whether the engine returned a dotted field flat ("specs.sku") or nested
 * ({ specs: { sku } }), also inside lists. A field under a shown one (specs shown) stays.
 */
export function separateHiddenSearchedFields(
    hits: SearchHit[],
    request: SearchRequest,
    context: SearchContext,
): void {
    if (!wantsHiddenSearchedFields(request)) return;
    const shown = request.includeFields ?? context.defaultResponseFields;
    if (shown.length === 0) return;
    const shownSet = new Set(shown);
    const underShown = (name: string) =>
        name.split('.').some((_, i, parts) => shownSet.has(parts.slice(0, i + 1).join('.')));
    const hidden = context.searchableFields.map(f => f.fieldName).filter(name => !underShown(name));

    for (const hit of hits) {
        const source = structuredClone(hit.source);
        const hiddenSearchedFields: Record<string, unknown> = {};
        for (const name of hidden) {
            if (name in source) {
                hiddenSearchedFields[name] = source[name];
                delete source[name];
                continue;
            }
            if (!name.includes('.')) continue;
            const values = takePath(source, name.split('.'));
            if (values.length > 0) hiddenSearchedFields[name] = values.length === 1 ? values[0] : values;
        }
        if (Object.keys(hiddenSearchedFields).length === 0) continue;
        hit.source = source;
        hit.hiddenSearchedFields = hiddenSearchedFields;
    }
}

/** Remove the values at a path from a value, across lists, and drop objects left empty. */
function takePath(value: unknown, path: string[]): unknown[] {
    if (Array.isArray(value)) return value.flatMap(item => takePath(item, path));
    if (!value || typeof value !== 'object') return [];
    const record = value as Record<string, unknown>;
    const [key, ...rest] = path;
    if (!(key in record)) return [];
    if (rest.length === 0) {
        const taken = record[key];
        delete record[key];
        return Array.isArray(taken) ? taken : [taken];
    }
    const taken = takePath(record[key], rest);
    const inner = record[key];
    // An object, or a list whose every item, left with nothing shown goes too: variants: [{}, {}]
    // isn't what responses show.
    if (Array.isArray(inner) ? inner.length > 0 && inner.every(isEmptyObject) : isEmptyObject(inner)) {
        delete record[key];
    }
    return taken;
}

function isEmptyObject(value: unknown): boolean {
    return !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0;
}
