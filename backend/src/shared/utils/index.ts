// src/shared/utils/index.ts

/**
 * Shared Utility Functions
 * Re-export all utilities for convenience
 */

export { cn } from './cn';

export {
    getNestedValue,
    evaluateFilter,
    resolveComputedValue,
    resolveAllComputedFields,
} from './computed-fields';

export { mapFieldTypeToES } from './elasticsearch-field-mapping';

export { inferFieldRole } from './field-roles';
export type { FieldRole } from './field-roles';

export { safeUrl, safeMailto } from './safe-url';

// Add other utilities as you create them:
// export * from './date';
// export * from './validation';
// export * from './format';