// src/features/search/filter-clauses.ts

import type { FilterClause } from './search.types';

const GROUPS = new Set<FilterClause['operator']>(['and', 'or', 'not']);

/**
 * The clauses that filter on a field, with groups (and, or, not) flattened away. Anything
 * else is skipped (no field, not a clause at all): nested filters of a public request are
 * not validated, and this also runs on a request that failed validation.
 */
export function leafFilters(filters: FilterClause[] | undefined): FilterClause[] {
    if (!Array.isArray(filters)) return [];
    return filters.flatMap((f) => {
        if (!f || typeof f !== 'object') return [];
        if (GROUPS.has(f.operator)) return leafFilters(f.filters);
        return f.field ? [f] : [];
    });
}

/** The fields a request filters on, each once */
export function filterFields(filters: FilterClause[] | undefined): string[] {
    return [...new Set(leafFilters(filters).map((f) => f.field))];
}
