// app/search-indexes/_lib/utils/jsonFieldParser.ts

/**
 * JSON Field Parser Utility
 * 
 * Parses JSON data and extracts all field paths with their inferred types.
 * Handles nested objects, arrays, and mixed types.
 */

import type { ParsedSourceField, InferredFieldType } from '@/features/search-index';

// ============================================================================
// TYPE INFERENCE
// ============================================================================

/**
 * Infer the type of a value
 */
function inferType(value: unknown): InferredFieldType {
    if (value === null) return 'null';
    if (value === undefined) return 'unknown';

    const type = typeof value;

    if (type === 'string') return 'string';
    if (type === 'number') return 'number';
    if (type === 'boolean') return 'boolean';

    if (Array.isArray(value)) {
        if (value.length === 0) return 'array:mixed';

        // Sample first few items to determine array type
        const sampleSize = Math.min(value.length, 5);
        const types = new Set<string>();

        for (let i = 0; i < sampleSize; i++) {
            const itemType = typeof value[i];
            if (value[i] === null) {
                types.add('null');
            } else if (Array.isArray(value[i])) {
                types.add('array');
            } else if (itemType === 'object') {
                types.add('object');
            } else {
                types.add(itemType);
            }
        }

        // Remove null from consideration if there are other types
        if (types.size > 1 && types.has('null')) {
            types.delete('null');
        }

        if (types.size === 1) {
            const itemType = types.values().next().value;
            switch (itemType) {
                case 'string': return 'array:string';
                case 'number': return 'array:number';
                case 'boolean': return 'array:boolean';
                case 'object': return 'array:object';
                default: return 'array:mixed';
            }
        }

        return 'array:mixed';
    }

    if (type === 'object') return 'object';

    return 'unknown';
}

/**
 * Get a display-friendly sample value
 */
function getSampleValue(value: unknown, maxLength: number = 100): unknown {
    if (value === null || value === undefined) return value;

    if (typeof value === 'string') {
        return value.length > maxLength ? value.substring(0, maxLength) + '...' : value;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
        return value;
    }

    if (Array.isArray(value)) {
        if (value.length === 0) return [];
        // Return first item as sample
        return [getSampleValue(value[0], maxLength)];
    }

    if (typeof value === 'object') {
        // Return keys only for object preview
        const keys = Object.keys(value as object);
        if (keys.length <= 3) {
            return `{${keys.join(', ')}}`;
        }
        return `{${keys.slice(0, 3).join(', ')}, ...}`;
    }

    return String(value);
}

// ============================================================================
// FIELD EXTRACTION
// ============================================================================

interface ExtractOptions {
    maxDepth?: number;
    includeArrayIndices?: boolean;
}

/**
 * Extract all field paths from a JSON object
 */
function extractFields(
    data: unknown,
    options: ExtractOptions = {}
): ParsedSourceField[] {
    const { maxDepth = 5, includeArrayIndices = false } = options;
    const fields: ParsedSourceField[] = [];
    const seenPaths = new Set<string>();

    function traverse(
        value: unknown,
        path: string,
        name: string,
        depth: number
    ) {
        // Avoid infinite recursion
        if (depth > maxDepth) return;

        // Avoid duplicate paths
        if (seenPaths.has(path)) return;
        seenPaths.add(path);

        const inferredType = inferType(value);

        // Add this field
        fields.push({
            name,
            path,
            inferredType,
            sampleValue: getSampleValue(value),
            depth,
            arrayItemType: inferredType.startsWith('array:')
                ? inferredType.replace('array:', '') as ParsedSourceField['arrayItemType']
                : undefined,
        });

        // Recurse into objects
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
            const obj = value as Record<string, unknown>;
            for (const key of Object.keys(obj)) {
                const childPath = path ? `${path}.${key}` : key;
                traverse(obj[key], childPath, key, depth + 1);
            }
        }

        // Optionally recurse into arrays (for object arrays)
        if (Array.isArray(value) && value.length > 0 && includeArrayIndices) {
            const firstItem = value[0];
            if (firstItem !== null && typeof firstItem === 'object' && !Array.isArray(firstItem)) {
                const obj = firstItem as Record<string, unknown>;
                for (const key of Object.keys(obj)) {
                    const childPath = `${path}[0].${key}`;
                    traverse(obj[key], childPath, key, depth + 1);
                }
            }
        }
    }

    // Handle array input (use first item as template)
    if (Array.isArray(data)) {
        if (data.length > 0 && typeof data[0] === 'object' && data[0] !== null) {
            const firstItem = data[0] as Record<string, unknown>;
            for (const key of Object.keys(firstItem)) {
                traverse(firstItem[key], key, key, 0);
            }
        }
    } else if (typeof data === 'object' && data !== null) {
        // Handle object input
        const obj = data as Record<string, unknown>;
        for (const key of Object.keys(obj)) {
            traverse(obj[key], key, key, 0);
        }
    }

    return fields;
}

// ============================================================================
// MAIN PARSER FUNCTION
// ============================================================================

export interface ParseJsonResult {
    success: boolean;
    fields: ParsedSourceField[];
    recordCount: number;
    error?: string;
}

/**
 * Parse JSON and extract all source fields
 */
export function parseJsonForFields(
    data: unknown,
    options?: ExtractOptions
): ParseJsonResult {
    try {
        if (data === null || data === undefined) {
            return {
                success: false,
                fields: [],
                recordCount: 0,
                error: 'No data provided',
            };
        }

        const recordCount = Array.isArray(data) ? data.length : 1;
        const fields = extractFields(data, options);

        // Sort fields: root level first, then by path
        fields.sort((a, b) => {
            if (a.depth !== b.depth) return a.depth - b.depth;
            return a.path.localeCompare(b.path);
        });

        return {
            success: true,
            fields,
            recordCount,
        };
    } catch (e) {
        return {
            success: false,
            fields: [],
            recordCount: 0,
            error: e instanceof Error ? e.message : 'Failed to parse JSON',
        };
    }
}

// ============================================================================
// TYPE COMPATIBILITY
// ============================================================================

// String-based index types that should accept string sources
const STRING_BASED_TYPES = new Set([
    'text',
    'keyword',
    'string',
    'url',
    'image_url',
    'email',
    'phone',
    'slug',
    'html',
    'markdown',
    'richtext',
    'uuid',
    'id',
]);

// Number-based index types that should accept number sources
const NUMBER_BASED_TYPES = new Set([
    'number',
    'integer',
    'float',
    'decimal',
    'price',
    'currency',
    'percent',
    'rating',
]);

// Date-based index types
const DATE_BASED_TYPES = new Set([
    'date',
    'datetime',
    'timestamp',
    'time',
]);

/**
 * Check if a source type is compatible with a target field type
 */
export function isTypeCompatible(
    sourceType: InferredFieldType,
    targetFieldType: string
): 'exact' | 'compatible' | 'coercible' | 'incompatible' {
    const target = targetFieldType.toLowerCase();

    // Handle null/unknown - they can go anywhere (will be empty/missing)
    if (sourceType === 'null' || sourceType === 'unknown') {
        return 'coercible';
    }

    // === STRING SOURCE ===
    if (sourceType === 'string') {
        // Exact match for string-based types
        if (STRING_BASED_TYPES.has(target)) {
            return 'exact';
        }
        // Strings might be dates
        if (DATE_BASED_TYPES.has(target)) {
            return 'compatible';
        }
        // Strings might be numeric (will need parsing)
        if (NUMBER_BASED_TYPES.has(target)) {
            return 'coercible';
        }
        // String to boolean (truthy/falsy)
        if (target === 'boolean') {
            return 'coercible';
        }
    }

    // === NUMBER SOURCE ===
    if (sourceType === 'number') {
        // Exact match for number-based types
        if (NUMBER_BASED_TYPES.has(target)) {
            return 'exact';
        }
        // Numbers can be stored as strings
        if (STRING_BASED_TYPES.has(target)) {
            return 'compatible';
        }
        // Number to boolean (0/1)
        if (target === 'boolean') {
            return 'compatible';
        }
    }

    // === BOOLEAN SOURCE ===
    if (sourceType === 'boolean') {
        if (target === 'boolean') {
            return 'exact';
        }
        // Booleans can be stored as strings ("true"/"false")
        if (STRING_BASED_TYPES.has(target)) {
            return 'compatible';
        }
        // Boolean to number (0/1)
        if (NUMBER_BASED_TYPES.has(target)) {
            return 'compatible';
        }
    }

    // === OBJECT SOURCE ===
    if (sourceType === 'object') {
        if (target === 'json' || target === 'object') {
            return 'exact';
        }
        // Objects can be serialized to string
        if (STRING_BASED_TYPES.has(target)) {
            return 'coercible';
        }
    }

    // === ARRAY SOURCES ===
    // String arrays are very common for multi-value fields
    if (sourceType === 'array:string') {
        // keyword, text etc. can handle string arrays (multi-value)
        if (STRING_BASED_TYPES.has(target)) {
            return 'compatible';
        }
        if (target === 'array' || target === 'json') {
            return 'exact';
        }
    }

    // Number arrays
    if (sourceType === 'array:number') {
        if (NUMBER_BASED_TYPES.has(target)) {
            return 'compatible';
        }
        if (target === 'array' || target === 'json') {
            return 'exact';
        }
    }

    // Boolean arrays
    if (sourceType === 'array:boolean') {
        if (target === 'boolean') {
            return 'compatible';
        }
        if (target === 'array' || target === 'json') {
            return 'exact';
        }
    }

    // Object arrays
    if (sourceType === 'array:object') {
        if (target === 'json' || target === 'object' || target === 'array') {
            return 'exact';
        }
    }

    // Mixed arrays
    if (sourceType === 'array:mixed') {
        if (target === 'json' || target === 'array') {
            return 'exact';
        }
        // Could work but unpredictable
        return 'coercible';
    }

    // General array type
    if (sourceType.startsWith('array:')) {
        if (target === 'array' || target === 'json') {
            return 'compatible';
        }
    }

    return 'incompatible';
}