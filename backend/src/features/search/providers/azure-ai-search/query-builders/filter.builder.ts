// src/features/search/providers/azure-ai-search/query-builders/filter.builder.ts

/**
 * Azure AI Search Filter Builder
 *
 * Builds OData $filter expressions from the provider-agnostic filter format.
 * Azure uses OData syntax: "field eq 'value'" instead of Elasticsearch Query DSL.
 *
 * For Collection fields (e.g., Collection(Edm.String)), Azure requires lambda
 * expressions: `tags/any(t: t eq 'value')` instead of `tags eq 'value'`.
 */

import 'server-only';

import type { FilterClause, FieldConfig } from '../../../search.types';

/** Field type lookup — maps field name to its type (e.g., 'array', 'text', 'keyword') */
export type FieldTypeLookup = Map<string, FieldConfig> | Map<string, { fieldType: string }>;

/**
 * Build an OData $filter string from search filters.
 *
 * @param filters - Array of filter clauses
 * @param fieldTypes - Optional field type lookup for Collection-aware filtering.
 *   When provided, array-typed fields use lambda expressions (any/all).
 */
export function buildAzureFilter(
    filters: FilterClause[],
    fieldTypes?: FieldTypeLookup,
): string | undefined {
    if (!filters || filters.length === 0) return undefined;

    const clauses = filters
        .map(filter => buildFilterClause(filter, fieldTypes))
        .filter(Boolean);

    if (clauses.length === 0) return undefined;
    return clauses.join(' and ');
}

function buildFilterClause(filter: FilterClause, fieldTypes?: FieldTypeLookup): string | null {
    const { field, operator, value } = filter;

    if (value === undefined || value === null) return null;

    const fieldType = getFieldType(field, fieldTypes);
    const isCollection = fieldType === 'array';

    switch (operator) {
        case 'eq': {
            if (isCollection) {
                // Collection(Edm.String): use lambda — field/any(t: t eq 'value')
                return `${field}/any(t: t eq ${formatCollectionElement(value)})`;
            }
            const operand = formatOperand(value, fieldType);
            return operand === null ? null : `${field} eq ${operand}`;
        }

        case 'neq': {
            if (isCollection) {
                // No item matches the value — field/all(t: t ne 'value')
                return `${field}/all(t: t ne ${formatCollectionElement(value)})`;
            }
            const operand = formatOperand(value, fieldType);
            return operand === null ? null : `${field} ne ${operand}`;
        }

        case 'gt': {
            const operand = formatOperand(value, fieldType);
            return operand === null ? null : `${field} gt ${operand}`;
        }

        case 'gte': {
            const operand = formatOperand(value, fieldType);
            return operand === null ? null : `${field} ge ${operand}`;
        }

        case 'lt': {
            const operand = formatOperand(value, fieldType);
            return operand === null ? null : `${field} lt ${operand}`;
        }

        case 'lte': {
            const operand = formatOperand(value, fieldType);
            return operand === null ? null : `${field} le ${operand}`;
        }

        case 'in': {
            if (!Array.isArray(value) || value.length === 0) return null;
            if (isCollection) {
                // Any item in the collection matches any of the given values
                const conditions = value.map(v => `t eq ${formatCollectionElement(v)}`);
                return `${field}/any(t: ${conditions.join(' or ')})`;
            }
            const conditions = value
                .map(v => formatOperand(v, fieldType))
                .filter((o): o is string => o !== null)
                .map(o => `${field} eq ${o}`);
            return conditions.length > 0 ? `(${conditions.join(' or ')})` : null;
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
            return parts.length > 0 ? parts.join(' and ') : null;
        }

        default:
            return null;
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
