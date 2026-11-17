// src/features/search/response-fields.ts

/**
 * Which fields a search caller gets back. The admin decides which fields an index shows in
 * responses; a public caller's field list can narrow that, never add to it, and its highlights
 * come from those fields only.
 */

import type { SearchContext, SearchHit, SearchRequest } from './search.types';

/**
 * The caller's field list kept to the fields the index shows. A field under a shown one
 * ("specs.sku" with "specs" shown) is kept; anything else is dropped. A list left empty reads
 * as no list, so the caller gets the shown fields: an empty list means different things to
 * each engine. With no shown fields the index narrows nothing, so neither does this.
 */
export function withinShownFields(request: SearchRequest, context: SearchContext): SearchRequest {
    const underShown = shownFieldTest(context);
    if (!request.includeFields || !underShown) return request;
    const kept = request.includeFields.filter(underShown);
    return { ...request, includeFields: kept.length > 0 ? kept : undefined };
}

/**
 * Highlights kept to the fields the index shows: each engine highlights every searchable field
 * by default, shown or not. With no shown fields the index narrows nothing, so neither does this.
 */
export function keepShownHighlights(hits: SearchHit[], context: SearchContext): void {
    const underShown = shownFieldTest(context);
    if (!underShown) return;
    for (const hit of hits) {
        if (!hit.highlights) continue;
        hit.highlights = Object.fromEntries(Object.entries(hit.highlights).filter(([name]) => underShown(name)));
    }
}

/** Whether a field is shown, or under a shown one ("specs.sku" with "specs" shown); null when the index shows everything. */
function shownFieldTest(context: SearchContext): ((name: string) => boolean) | null {
    const shown = context.defaultResponseFields;
    if (shown.length === 0) return null;
    const shownSet = new Set(shown);
    return (name: string) => name.split('.').some((_, i, parts) => shownSet.has(parts.slice(0, i + 1).join('.')));
}
