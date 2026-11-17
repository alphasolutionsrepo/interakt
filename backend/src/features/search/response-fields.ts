// src/features/search/response-fields.ts

/**
 * Which fields a search caller gets back. The admin decides which fields an index shows in
 * responses; a public caller's field list can narrow that, never add to it.
 */

import type { SearchContext, SearchRequest } from './search.types';

/**
 * The caller's field list kept to the fields the index shows. A field under a shown one
 * ("specs.sku" with "specs" shown) is kept; anything else is dropped. A list left empty reads
 * as no list, so the caller gets the shown fields: an empty list means different things to
 * each engine. With no shown fields the index narrows nothing, so neither does this.
 */
export function withinShownFields(request: SearchRequest, context: SearchContext): SearchRequest {
    const shown = context.defaultResponseFields;
    if (!request.includeFields || shown.length === 0) return request;
    const shownSet = new Set(shown);
    const underShown = (name: string) =>
        name.split('.').some((_, i, parts) => shownSet.has(parts.slice(0, i + 1).join('.')));
    const kept = request.includeFields.filter(underShown);
    return { ...request, includeFields: kept.length > 0 ? kept : undefined };
}
