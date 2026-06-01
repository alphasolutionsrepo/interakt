// src/shared/utils/computed-fields.ts

/**
 * Computed Fields Utility
 *
 * Provides functions for extracting and aggregating values from nested arrays
 * in source documents. Used by the 'computed' mapping mode.
 */

import type {
    ComputedFieldConfig,
    ComputedAggregation,
    ComputedFilterConfig,
} from '@/shared/constants/search-index.constants';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get a nested value from an object using dot-notation path
 * @example getNestedValue({ a: { b: 1 } }, 'a.b') => 1
 */
export function getNestedValue(
    obj: Record<string, unknown>,
    path: string
): unknown {
    if (!path) return undefined;

    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
        if (current === null || current === undefined) {
            return undefined;
        }
        if (typeof current !== 'object') {
            return undefined;
        }
        current = (current as Record<string, unknown>)[part];
    }

    return current;
}

/**
 * Evaluate a filter condition against a value
 */
export function evaluateFilter(
    item: Record<string, unknown>,
    filter: ComputedFilterConfig
): boolean {
    const value = getNestedValue(item, filter.field);
    const { operator, value: compareValue } = filter;

    switch (operator) {
        case 'exists':
            return value !== undefined && value !== null;
        case 'eq':
            return value === compareValue;
        case 'neq':
            return value !== compareValue;
        case 'gt':
            return typeof value === 'number' && typeof compareValue === 'number' && value > compareValue;
        case 'gte':
            return typeof value === 'number' && typeof compareValue === 'number' && value >= compareValue;
        case 'lt':
            return typeof value === 'number' && typeof compareValue === 'number' && value < compareValue;
        case 'lte':
            return typeof value === 'number' && typeof compareValue === 'number' && value <= compareValue;
        default:
            return true;
    }
}

// ============================================================================
// AGGREGATION FUNCTIONS
// ============================================================================

/**
 * Apply aggregation to extracted values
 */
function applyAggregation(
    values: unknown[],
    aggregation: ComputedAggregation
): unknown {
    // Filter out null/undefined values for most aggregations
    const validValues = values.filter(v => v !== null && v !== undefined);

    switch (aggregation) {
        case 'unique': {
            // Return unique values as array
            const seen = new Set<string>();
            const unique: unknown[] = [];
            for (const v of validValues) {
                const key = JSON.stringify(v);
                if (!seen.has(key)) {
                    seen.add(key);
                    unique.push(v);
                }
            }
            return unique;
        }

        case 'min': {
            const numbers = validValues.filter((v): v is number => typeof v === 'number');
            if (numbers.length === 0) return null;
            return Math.min(...numbers);
        }

        case 'max': {
            const numbers = validValues.filter((v): v is number => typeof v === 'number');
            if (numbers.length === 0) return null;
            return Math.max(...numbers);
        }

        case 'sum': {
            const numbers = validValues.filter((v): v is number => typeof v === 'number');
            return numbers.reduce((acc, n) => acc + n, 0);
        }

        case 'avg': {
            const numbers = validValues.filter((v): v is number => typeof v === 'number');
            if (numbers.length === 0) return null;
            return numbers.reduce((acc, n) => acc + n, 0) / numbers.length;
        }

        case 'count':
            return validValues.length;

        case 'any':
            return validValues.some(v => Boolean(v));

        case 'all':
            return validValues.length > 0 && validValues.every(v => Boolean(v));

        case 'first':
            return validValues[0] ?? null;

        case 'last':
            return validValues[validValues.length - 1] ?? null;

        case 'flatten': {
            // Flatten nested arrays
            const result: unknown[] = [];
            for (const v of validValues) {
                if (Array.isArray(v)) {
                    result.push(...v);
                } else {
                    result.push(v);
                }
            }
            return result;
        }

        default:
            return null;
    }
}

// ============================================================================
// MAIN RESOLVER
// ============================================================================

/**
 * Resolve a computed field value from a source document
 *
 * @param document - The source document
 * @param config - The computed field configuration
 * @returns The computed value
 *
 * @example
 * // Extract unique colors from variants
 * resolveComputedValue(
 *   { variants: [{ color: 'Red' }, { color: 'Blue' }, { color: 'Red' }] },
 *   { sourceArrayPath: 'variants', extractField: 'color', aggregation: 'unique' }
 * )
 * // => ['Red', 'Blue']
 *
 * @example
 * // Get minimum price
 * resolveComputedValue(
 *   { variants: [{ price: 29.99 }, { price: 19.99 }, { price: 39.99 }] },
 *   { sourceArrayPath: 'variants', extractField: 'price', aggregation: 'min' }
 * )
 * // => 19.99
 *
 * @example
 * // Check if any variant is in stock
 * resolveComputedValue(
 *   { variants: [{ inStock: false }, { inStock: true }] },
 *   { sourceArrayPath: 'variants', extractField: 'inStock', aggregation: 'any' }
 * )
 * // => true
 *
 * @example
 * // Get sizes only for in-stock variants
 * resolveComputedValue(
 *   { variants: [{ size: 'S', inStock: false }, { size: 'M', inStock: true }] },
 *   {
 *     sourceArrayPath: 'variants',
 *     extractField: 'size',
 *     aggregation: 'unique',
 *     filter: { field: 'inStock', operator: 'eq', value: true }
 *   }
 * )
 * // => ['M']
 */
export function resolveComputedValue(
    document: Record<string, unknown>,
    config: ComputedFieldConfig
): unknown {
    const { sourceArrayPath, extractField, aggregation, filter } = config;

    // 1. Get the source array
    const sourceArray = getNestedValue(document, sourceArrayPath);

    if (!Array.isArray(sourceArray)) {
        // Return appropriate empty value based on aggregation
        switch (aggregation) {
            case 'unique':
            case 'flatten':
                return [];
            case 'count':
                return 0;
            case 'any':
                return false;
            case 'all':
                return false;
            default:
                return null;
        }
    }

    // 2. Apply filter if specified
    let items: Record<string, unknown>[] = sourceArray.filter(
        (item): item is Record<string, unknown> =>
            item !== null && typeof item === 'object' && !Array.isArray(item)
    );

    if (filter) {
        items = items.filter(item => evaluateFilter(item, filter));
    }

    // 3. Extract the field from each item
    const values = items.map(item => getNestedValue(item, extractField));

    // 4. Apply aggregation
    return applyAggregation(values, aggregation);
}

// ============================================================================
// BATCH PROCESSING
// ============================================================================

/**
 * Resolve all computed fields for a document
 *
 * @param document - The source document
 * @param computedConfigs - Map of field name to computed config
 * @returns Object with computed values
 */
export function resolveAllComputedFields(
    document: Record<string, unknown>,
    computedConfigs: Record<string, ComputedFieldConfig>
): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [fieldName, config] of Object.entries(computedConfigs)) {
        result[fieldName] = resolveComputedValue(document, config);
    }

    return result;
}
