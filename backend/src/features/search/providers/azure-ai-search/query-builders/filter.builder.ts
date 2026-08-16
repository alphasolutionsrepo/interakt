// src/features/search/providers/azure-ai-search/query-builders/filter.builder.ts

/**
 * Azure AI Search Filter Builder
 *
 * Builds OData $filter expressions from the provider-agnostic filter format.
 * Azure uses OData syntax: "field eq 'value'" instead of Elasticsearch Query DSL.
 *
 * For Collection fields (e.g., Collection(Edm.String)), Azure requires lambda
 * expressions: `tags/any(t: t eq 'value')` instead of `tags eq 'value'`.
 *
 * ## Dropped clauses must never be silent
 *
 * A clause this builder cannot express used to be discarded, leaving the
 * remaining clauses to run on their own. That is safe-looking and badly wrong: a
 * filter set is a conjunction, so removing a term **widens** it. On a delete
 * path it is destructive — `locale eq 'en' AND uniqueId nin [...]` collapsed to
 * `locale eq 'en'`, turning "delete everything except what I just wrote" into
 * "delete everything", and it emptied a production index exactly that way.
 *
 * So translation and policy are separated:
 *
 *   - `buildAzureFilterParts` translates and **reports** what it could not
 *     express. Nothing is lost, nothing throws.
 *   - `buildAzureFilter` is the strict wrapper and **throws** if anything was
 *     dropped. Search and delete paths use this, so an unsupported clause is a
 *     loud 400 rather than a quietly different result set.
 *
 * Callers that legitimately want to continue without a clause (the LLM tool
 * executor, which surfaces them as "unapplied") use the parts form and report
 * every entry.
 */

import 'server-only';

import { SearchError, type FilterClause, type FieldConfig } from '../../../search.types';

/** Field type lookup — maps field name to its type (e.g., 'array', 'text', 'keyword') */
export type FieldTypeLookup = Map<string, FieldConfig> | Map<string, { fieldType: string }>;

/** A clause that could not be expressed as OData, and why. */
export type DroppedClause = {
    field: string;
    operator: FilterClause['operator'];
    reason: string;
};

export type AzureFilterParts = {
    /** Undefined when no clause survived. */
    odata?: string;
    dropped: DroppedClause[];
};

/**
 * Translate filters to OData, reporting anything that could not be expressed.
 *
 * Never throws — the caller decides whether a dropped clause is acceptable.
 */
export function buildAzureFilterParts(
    filters: FilterClause[],
    fieldTypes?: FieldTypeLookup,
): AzureFilterParts {
    if (!filters || filters.length === 0) return { dropped: [] };

    const clauses: string[] = [];
    const dropped: DroppedClause[] = [];

    for (const filter of filters) {
        const result = buildFilterClause(filter, fieldTypes);
        if (typeof result === 'string') {
            clauses.push(result);
        } else {
            dropped.push({ field: filter.field, operator: filter.operator, reason: result.reason });
        }
    }

    return { odata: clauses.length > 0 ? clauses.join(' and ') : undefined, dropped };
}

/**
 * Build an OData $filter string, refusing to weaken the filter set.
 *
 * @param filters - Array of filter clauses
 * @param fieldTypes - Optional field type lookup for Collection-aware filtering.
 *   When provided, array-typed fields use lambda expressions (any/all).
 * @throws SearchError if any clause cannot be expressed as OData.
 */
export function buildAzureFilter(
    filters: FilterClause[],
    fieldTypes?: FieldTypeLookup,
): string | undefined {
    const { odata, dropped } = buildAzureFilterParts(filters, fieldTypes);

    if (dropped.length > 0) {
        const detail = dropped.map(d => `${d.field} ${d.operator} (${d.reason})`).join('; ');
        throw new SearchError(
            `Filter cannot be expressed for Azure AI Search: ${detail}`,
            'INVALID_FILTER',
            { dropped },
        );
    }

    return odata;
}

/** Why a clause was dropped. Distinguishable from a built clause by not being a string. */
type ClauseDrop = { reason: string };

const drop = (reason: string): ClauseDrop => ({ reason });

function buildFilterClause(
    filter: FilterClause,
    fieldTypes?: FieldTypeLookup,
): string | ClauseDrop {
    const { field, operator, value } = filter;

    if (value === undefined || value === null) return drop('value is null or undefined');

    const fieldType = getFieldType(field, fieldTypes);
    const isCollection = fieldType === 'array';
    const notCoercible = `value is not coercible to field type "${fieldType ?? 'unknown'}"`;

    switch (operator) {
        case 'eq': {
            if (isCollection) {
                // Collection(Edm.String): use lambda — field/any(t: t eq 'value')
                return `${field}/any(t: t eq ${formatCollectionElement(value)})`;
            }
            const operand = formatOperand(value, fieldType);
            return operand === null ? drop(notCoercible) : `${field} eq ${operand}`;
        }

        case 'neq': {
            if (isCollection) {
                // No item matches the value — field/all(t: t ne 'value')
                return `${field}/all(t: t ne ${formatCollectionElement(value)})`;
            }
            const operand = formatOperand(value, fieldType);
            return operand === null ? drop(notCoercible) : `${field} ne ${operand}`;
        }

        case 'gt': {
            const operand = formatOperand(value, fieldType);
            return operand === null ? drop(notCoercible) : `${field} gt ${operand}`;
        }

        case 'gte': {
            const operand = formatOperand(value, fieldType);
            return operand === null ? drop(notCoercible) : `${field} ge ${operand}`;
        }

        case 'lt': {
            const operand = formatOperand(value, fieldType);
            return operand === null ? drop(notCoercible) : `${field} lt ${operand}`;
        }

        case 'lte': {
            const operand = formatOperand(value, fieldType);
            return operand === null ? drop(notCoercible) : `${field} le ${operand}`;
        }

        case 'in': {
            if (!Array.isArray(value) || value.length === 0) {
                return drop('IN requires a non-empty array');
            }
            if (isCollection) {
                // Any item in the collection matches any of the given values
                const conditions = value.map(v => `t eq ${formatCollectionElement(v)}`);
                return `${field}/any(t: ${conditions.join(' or ')})`;
            }
            const conditions = value
                .map(v => formatOperand(v, fieldType))
                .filter((o): o is string => o !== null)
                .map(o => `${field} eq ${o}`);
            return conditions.length > 0 ? `(${conditions.join(' or ')})` : drop(notCoercible);
        }

        // The inverse of `in`, and the inversion is the whole operator: `in` is a
        // disjunction of `eq` (any/or), `nin` a conjunction of `ne` (all/and).
        // Getting that backwards yields a filter that quietly matches too much.
        case 'nin': {
            if (!Array.isArray(value) || value.length === 0) {
                return drop('NIN requires a non-empty array');
            }
            if (isCollection) {
                // No item in the collection matches any of the given values
                const conditions = value.map(v => `t ne ${formatCollectionElement(v)}`);
                return `${field}/all(t: ${conditions.join(' and ')})`;
            }
            const conditions = value
                .map(v => formatOperand(v, fieldType))
                .filter((o): o is string => o !== null)
                .map(o => `${field} ne ${o}`);
            return conditions.length > 0 ? `(${conditions.join(' and ')})` : drop(notCoercible);
        }

        case 'exists':
            return value ? `${field} ne null` : `${field} eq null`;

        case 'contains':
            return `search.ismatch('${escapeOData(String(value))}', '${field}')`;

        case 'prefix':
            return `search.ismatch('${escapeOData(String(value))}*', '${field}')`;

        case 'range': {
            const range = value as { gte?: number | string; lte?: number | string; gt?: number | string; lt?: number | string };
            const parts: string[] = [];
            const push = (op: string, v: number | string | undefined) => {
                if (v === undefined) return;
                const operand = formatOperand(v, fieldType);
                if (operand !== null) parts.push(`${field} ${op} ${operand}`);
            };
            push('ge', range.gte);
            push('gt', range.gt);
            push('le', range.lte);
            push('lt', range.lt);
            return parts.length > 0 ? parts.join(' and ') : drop('range has no usable bounds');
        }

        default:
            return drop(`operator "${operator}" is not supported by Azure AI Search`);
    }
}

/** Look up a field's declared type from the field-type map. */
function getFieldType(field: string, fieldTypes?: FieldTypeLookup): string | undefined {
    return fieldTypes?.get(field)?.fieldType;
}

/**
 * Format a scalar value as an OData literal based on the field's declared type.
 * Filter values arrive from callers as strings, so coercion must be driven by the
 * field type — not the JS typeof the value. A keyword field may legitimately hold
 * "1275" (quote it), while a number field receives "1100" (emit a bare literal).
 * Returns null when the value can't be coerced to the field's type (clause skipped).
 */
function formatOperand(value: unknown, fieldType?: string): string | null {
    switch (fieldType) {
        case 'number': {
            const n = typeof value === 'number' ? value : Number(String(value).trim());
            return Number.isFinite(n) ? String(n) : null;
        }
        case 'boolean': {
            if (typeof value === 'boolean') return value ? 'true' : 'false';
            const s = String(value).trim().toLowerCase();
            if (s === 'true') return 'true';
            if (s === 'false') return 'false';
            return null;
        }
        case 'date':
        case 'datetime':
            // Edm.DateTimeOffset literal — unquoted ISO 8601
            return String(value);
        default:
            // text / keyword / url / email / json / image_url / unknown → quoted string
            return `'${escapeOData(String(value))}'`;
    }
}

/**
 * Format a collection element. Array fields in current schemas are
 * Collection(Edm.String), so elements are emitted as quoted strings.
 */
function formatCollectionElement(value: unknown): string {
    return `'${escapeOData(String(value))}'`;
}

function escapeOData(value: string): string {
    return value.replace(/'/g, "''");
}
