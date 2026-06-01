// src/features/search/providers/elasticsearch/query-builders/filter.builder.ts

/**
 * Elasticsearch Filter Query Builder
 *
 * Transforms API filter clauses into Elasticsearch query DSL.
 * Supports all filter operators including boolean combinations.
 *
 * This is ES-specific — other providers will have their own filter builders
 * (e.g., Azure AI Search uses OData $filter syntax).
 */

import type { FilterClause, FilterOperator, RangeValue, SearchContext } from '../../../search.types';
import { SearchError } from '../../../search.types';
import { validateFilterableField } from '../../../search-context.builder';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Elasticsearch query DSL types (simplified)
 */
export interface ESQuery {
    bool?: ESBoolQuery;
    term?: Record<string, unknown>;
    terms?: Record<string, unknown[]>;
    range?: Record<string, ESRangeQuery>;
    match?: Record<string, unknown>;
    prefix?: Record<string, unknown>;
    wildcard?: Record<string, unknown>;
    exists?: { field: string };
    match_phrase_prefix?: Record<string, unknown>;
}

export interface ESBoolQuery {
    must?: ESQuery[];
    must_not?: ESQuery[];
    should?: ESQuery[];
    filter?: ESQuery[];
    minimum_should_match?: number;
}

export interface ESRangeQuery {
    gt?: number | string;
    gte?: number | string;
    lt?: number | string;
    lte?: number | string;
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

/**
 * Build Elasticsearch filter query from API filter clauses
 *
 * @param filters - Array of filter clauses from API
 * @param context - Search context with field configuration
 * @returns Elasticsearch query DSL for filters
 */
export function buildFilterQuery(
    filters: FilterClause[],
    context: SearchContext
): ESQuery | undefined {
    if (!filters || filters.length === 0) {
        return undefined;
    }

    // Multiple top-level filters are combined with AND
    const esFilters = filters.map(filter => buildSingleFilter(filter, context));

    if (esFilters.length === 1) {
        return esFilters[0];
    }

    return {
        bool: {
            filter: esFilters,
        },
    };
}

/**
 * Build a single filter clause into ES query
 */
function buildSingleFilter(filter: FilterClause, context: SearchContext): ESQuery {
    const { field, operator, value, filters: nestedFilters } = filter;

    // Boolean operators (and, or, not) use nested filters
    if (operator === 'and' || operator === 'or' || operator === 'not') {
        return buildBooleanFilter(operator, nestedFilters, context);
    }

    // Validate field exists and can be filtered
    const validation = validateFilterableField(context, field);
    if (!validation.valid) {
        throw new SearchError(
            validation.error || `Invalid filter field: ${field}`,
            'INVALID_FILTER',
            { field, operator }
        );
    }

    // Get field configuration
    const fieldConfig = context.allFields.get(field);
    if (!fieldConfig) {
        throw new SearchError(
            `Field "${field}" not found in index`,
            'FIELD_NOT_FOUND',
            { field }
        );
    }

    // Build operator-specific query
    return buildOperatorQuery(field, operator, value, fieldConfig.fieldType);
}

// ============================================================================
// BOOLEAN OPERATORS
// ============================================================================

/**
 * Build boolean combination filter (AND, OR, NOT)
 */
function buildBooleanFilter(
    operator: 'and' | 'or' | 'not',
    nestedFilters: FilterClause[] | undefined,
    context: SearchContext
): ESQuery {
    if (!nestedFilters || nestedFilters.length === 0) {
        throw new SearchError(
            `Boolean operator "${operator}" requires nested filters`,
            'INVALID_FILTER',
            { operator }
        );
    }

    const esFilters = nestedFilters.map(f => buildSingleFilter(f, context));

    switch (operator) {
        case 'and':
            return {
                bool: {
                    filter: esFilters,
                },
            };

        case 'or':
            return {
                bool: {
                    should: esFilters,
                    minimum_should_match: 1,
                },
            };

        case 'not':
            return {
                bool: {
                    must_not: esFilters,
                },
            };
    }
}

// ============================================================================
// OPERATOR BUILDERS
// ============================================================================

/**
 * Build query for specific operator
 */
function buildOperatorQuery(
    field: string,
    operator: FilterOperator,
    value: unknown,
    fieldType: string
): ESQuery {
    // Get the ES field name (add .keyword suffix for text fields in term queries)
    const keywordField = fieldType === 'text' ? `${field}.keyword` : field;

    switch (operator) {
        case 'eq':
            return buildEqQuery(keywordField, value);

        case 'neq':
            return buildNeqQuery(keywordField, value);

        case 'gt':
            return buildRangeQuery(field, { gt: value as number | string });

        case 'gte':
            return buildRangeQuery(field, { gte: value as number | string });

        case 'lt':
            return buildRangeQuery(field, { lt: value as number | string });

        case 'lte':
            return buildRangeQuery(field, { lte: value as number | string });

        case 'in':
            return buildInQuery(keywordField, value);

        case 'nin':
            return buildNinQuery(keywordField, value);

        case 'contains':
            // match_phrase_prefix only works on text fields
            // For keyword fields, use wildcard query instead
            return buildContainsQuery(field, value as string, fieldType);

        case 'prefix':
            return buildPrefixQuery(keywordField, value as string);

        case 'exists':
            return buildExistsQuery(field);

        case 'missing':
            return buildMissingQuery(field);

        case 'range':
            return buildRangeValueQuery(field, value as RangeValue);

        default:
            throw new SearchError(
                `Unsupported filter operator: ${operator}`,
                'INVALID_FILTER',
                { operator }
            );
    }
}

/**
 * Build equality query
 */
function buildEqQuery(field: string, value: unknown): ESQuery {
    return {
        term: {
            [field]: value,
        },
    };
}

/**
 * Build not-equal query
 */
function buildNeqQuery(field: string, value: unknown): ESQuery {
    return {
        bool: {
            must_not: [
                {
                    term: {
                        [field]: value,
                    },
                },
            ],
        },
    };
}

/**
 * Build range query with single comparison
 */
function buildRangeQuery(field: string, range: ESRangeQuery): ESQuery {
    return {
        range: {
            [field]: range,
        },
    };
}

/**
 * Build IN query (value in array)
 */
/**
 * Coerce an `in`/`nin` value to an array. LLM param-extraction often emits a
 * single scalar for a set filter (e.g. {operator:'in', value:'XL'}), so wrap a
 * scalar into a one-element array rather than failing the whole search. A truly
 * absent value (null/undefined) stays invalid.
 */
function normalizeSetValues(value: unknown): unknown[] | null {
    if (Array.isArray(value)) return value;
    if (value === null || value === undefined) return null;
    return [value];
}

function buildInQuery(field: string, value: unknown): ESQuery {
    const values = normalizeSetValues(value);
    if (values === null) {
        throw new SearchError(
            'IN operator requires an array value',
            'INVALID_FILTER',
            { field, value }
        );
    }

    return {
        terms: {
            [field]: values,
        },
    };
}

/**
 * Build NOT IN query (value not in array)
 */
function buildNinQuery(field: string, value: unknown): ESQuery {
    if (!Array.isArray(value)) {
        throw new SearchError(
            'NIN operator requires an array value',
            'INVALID_FILTER',
            { field, value }
        );
    }

    return {
        bool: {
            must_not: [
                {
                    terms: {
                        [field]: value,
                    },
                },
            ],
        },
    };
}

/**
 * Build contains query (text search within field)
 * For text fields: uses match_phrase_prefix (supports analysis)
 * For keyword fields: uses wildcard query with * wildcards
 */
function buildContainsQuery(field: string, value: string, fieldType: string): ESQuery {
    // match_phrase_prefix only works on text fields
    // For keyword fields, use case-insensitive wildcard query
    if (fieldType === 'keyword') {
        return {
            wildcard: {
                [field]: {
                    value: `*${value.toLowerCase()}*`,
                    case_insensitive: true,
                },
            },
        };
    }

    // For text fields, use match_phrase_prefix (supports analysis)
    return {
        match_phrase_prefix: {
            [field]: {
                query: value,
            },
        },
    };
}

/**
 * Build prefix query
 */
function buildPrefixQuery(field: string, value: string): ESQuery {
    return {
        prefix: {
            [field]: {
                value: value,
            },
        },
    };
}

/**
 * Build exists query (field has value)
 */
function buildExistsQuery(field: string): ESQuery {
    return {
        exists: {
            field: field,
        },
    };
}

/**
 * Build missing query (field has no value)
 */
function buildMissingQuery(field: string): ESQuery {
    return {
        bool: {
            must_not: [
                {
                    exists: {
                        field: field,
                    },
                },
            ],
        },
    };
}

/**
 * Build range query from RangeValue object
 */
function buildRangeValueQuery(field: string, value: RangeValue): ESQuery {
    const range: ESRangeQuery = {};

    if (value.from !== undefined) {
        if (value.includeLower !== false) {
            range.gte = value.from;
        } else {
            range.gt = value.from;
        }
    }

    if (value.to !== undefined) {
        if (value.includeUpper !== false) {
            range.lte = value.to;
        } else {
            range.lt = value.to;
        }
    }

    if (Object.keys(range).length === 0) {
        throw new SearchError(
            'Range filter requires at least "from" or "to" value',
            'INVALID_FILTER',
            { field, value }
        );
    }

    return {
        range: {
            [field]: range,
        },
    };
}
