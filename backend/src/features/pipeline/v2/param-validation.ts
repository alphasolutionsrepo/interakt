// src/features/pipeline/v2/param-validation.ts

/**
 * D2b: Parameter Validation — Deterministic Pipeline V2
 *
 * Validates extracted parameters against the tool's input schema.
 * Pure backend logic — no AI call.
 *
 * Features:
 * - Required field checking
 * - Type checking with basic coercion (string "50" → number 50)
 * - Enum validation with fuzzy matching (case-insensitive, Levenshtein)
 * - Nested object validation
 *
 * See: docs/platform-evolution/DETERMINISTIC-PIPELINE-V2.md § D2b
 */

import { createLogger } from '@/shared/logger/logger';
import type {
  ParamValidationInput,
  ParamValidationResult,
  ValidationError,
  ModuleResult,
} from './v2.types';
import type { ToolParameterProperty } from '@/features/ai-service/ai-service.types';

const logger = createLogger('v2:param-validation');

// ============================================================================
// MODULE ENTRY POINT
// ============================================================================

/**
 * Validate and coerce extracted parameters against a tool's input schema.
 * Returns corrected parameters (with coercions applied) and any remaining errors.
 */
export function validateParameters(
  input: ParamValidationInput,
): ModuleResult<ParamValidationResult> {
  const startTime = Date.now();

  try {
    const errors: ValidationError[] = [];
    const corrected = { ...input.parameters };

    const schema = input.inputSchema;
    const requiredSet = new Set(schema.required ?? []);

    // 1. Check required fields
    for (const field of requiredSet) {
      const value = corrected[field];
      if (value === undefined || value === null || value === '') {
        errors.push({
          field,
          message: 'Required field is missing or empty',
        });
      }
    }

    // 2. Validate and coerce each provided field
    for (const [field, prop] of Object.entries(schema.properties)) {
      const value = corrected[field];

      // Skip missing optional fields
      if (value === undefined || value === null) continue;

      const result = validateField(field, value, prop);

      if (result.error) {
        errors.push(result.error);
      }

      if (result.correctedValue !== undefined) {
        corrected[field] = result.correctedValue;
      }
    }

    // 3. Remove unknown fields (not in schema)
    const knownFields = new Set(Object.keys(schema.properties));
    for (const field of Object.keys(corrected)) {
      if (!knownFields.has(field)) {
        delete corrected[field];
      }
    }

    const durationMs = Date.now() - startTime;
    const valid = errors.length === 0;

    if (!valid) {
      logger.info('Validation found errors', {
        errorCount: errors.length,
        fields: errors.map((e) => e.field),
      });
    }

    return {
      success: true,
      data: { valid, parameters: corrected, errors },
      summary: valid
        ? 'All parameters valid'
        : `${errors.length} validation error(s): ${errors.map((e) => e.field).join(', ')}`,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Validation failed unexpectedly', err);

    return {
      success: false,
      summary: `Validation failed: ${err.message}`,
      durationMs,
    };
  }
}

// ============================================================================
// FIELD VALIDATION
// ============================================================================

interface FieldValidationResult {
  error?: ValidationError;
  correctedValue?: unknown;
}

function validateField(
  field: string,
  value: unknown,
  prop: ToolParameterProperty,
): FieldValidationResult {
  // Type-specific validation
  switch (prop.type) {
    case 'string':
      return validateString(field, value, prop);
    case 'number':
    case 'integer':
      return validateNumber(field, value, prop);
    case 'boolean':
      return validateBoolean(field, value);
    case 'array':
      return validateArray(field, value, prop);
    case 'object':
      return validateObject(field, value, prop);
    default:
      // Unknown type — pass through
      return {};
  }
}

function validateString(
  field: string,
  value: unknown,
  prop: ToolParameterProperty,
): FieldValidationResult {
  // Coerce numbers/booleans to string
  const strValue = typeof value === 'string' ? value : String(value);

  // Enum validation with fuzzy matching
  if (prop.enum && prop.enum.length > 0) {
    const matched = fuzzyMatchEnum(strValue, prop.enum);
    if (matched) {
      return { correctedValue: matched };
    }
    return {
      error: {
        field,
        message: `Value "${strValue}" is not a valid option`,
        expected: prop.enum.join(', '),
        received: strValue,
      },
    };
  }

  return { correctedValue: strValue };
}

function validateNumber(
  field: string,
  value: unknown,
  _prop: ToolParameterProperty,
): FieldValidationResult {
  // Already a number
  if (typeof value === 'number' && !isNaN(value)) {
    return { correctedValue: value };
  }

  // Coerce string to number
  if (typeof value === 'string') {
    // Strip currency symbols and commas
    const cleaned = value.replace(/[$€£,]/g, '').trim();
    const num = Number(cleaned);
    if (!isNaN(num)) {
      return { correctedValue: num };
    }
  }

  return {
    error: {
      field,
      message: `Expected a number`,
      expected: 'number',
      received: value,
    },
  };
}

function validateBoolean(
  field: string,
  value: unknown,
): FieldValidationResult {
  if (typeof value === 'boolean') {
    return { correctedValue: value };
  }

  // Coerce common string representations
  if (typeof value === 'string') {
    const lower = value.toLowerCase().trim();
    if (lower === 'true' || lower === '1' || lower === 'yes') {
      return { correctedValue: true };
    }
    if (lower === 'false' || lower === '0' || lower === 'no') {
      return { correctedValue: false };
    }
  }

  return {
    error: {
      field,
      message: `Expected a boolean`,
      expected: 'boolean',
      received: value,
    },
  };
}

function validateArray(
  field: string,
  value: unknown,
  prop: ToolParameterProperty,
): FieldValidationResult {
  if (!Array.isArray(value)) {
    return {
      error: {
        field,
        message: `Expected an array`,
        expected: 'array',
        received: typeof value,
      },
    };
  }

  // Validate items if items schema is defined
  if (prop.items && value.length > 0) {
    const correctedItems: unknown[] = [];
    for (let i = 0; i < value.length; i++) {
      const itemResult = validateField(`${field}[${i}]`, value[i], prop.items);
      correctedItems.push(itemResult.correctedValue ?? value[i]);
      // Collect item-level errors but don't fail the whole array
      if (itemResult.error) {
        return { error: itemResult.error };
      }
    }
    return { correctedValue: correctedItems };
  }

  return { correctedValue: value };
}

function validateObject(
  field: string,
  value: unknown,
  prop: ToolParameterProperty,
): FieldValidationResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {
      error: {
        field,
        message: `Expected an object`,
        expected: 'object',
        received: typeof value,
      },
    };
  }

  // Validate nested properties if defined
  if (prop.properties) {
    const obj = value as Record<string, unknown>;
    const corrected: Record<string, unknown> = { ...obj };
    const nestedRequired = new Set(prop.required ?? []);

    for (const reqField of nestedRequired) {
      if (corrected[reqField] === undefined || corrected[reqField] === null) {
        return {
          error: {
            field: `${field}.${reqField}`,
            message: 'Required field is missing',
          },
        };
      }
    }

    for (const [nestedField, nestedProp] of Object.entries(prop.properties)) {
      if (corrected[nestedField] === undefined || corrected[nestedField] === null) continue;
      const nestedResult = validateField(`${field}.${nestedField}`, corrected[nestedField], nestedProp);
      if (nestedResult.error) return { error: nestedResult.error };
      if (nestedResult.correctedValue !== undefined) {
        corrected[nestedField] = nestedResult.correctedValue;
      }
    }

    return { correctedValue: corrected };
  }

  return { correctedValue: value };
}

// ============================================================================
// FUZZY ENUM MATCHING
// ============================================================================

/**
 * Attempt to match a value against an enum list with fuzzy matching.
 * Priority: exact → case-insensitive → Levenshtein distance ≤ 2.
 * Returns the corrected enum value, or null if no match.
 */
function fuzzyMatchEnum(value: string, allowed: string[]): string | null {
  // 1. Exact match
  if (allowed.includes(value)) return value;

  // 2. Case-insensitive match
  const lower = value.toLowerCase();
  const caseMatch = allowed.find((a) => a.toLowerCase() === lower);
  if (caseMatch) return caseMatch;

  // 3. Levenshtein distance ≤ 2
  let bestMatch: string | null = null;
  let bestDistance = Infinity;

  for (const candidate of allowed) {
    const dist = levenshteinDistance(lower, candidate.toLowerCase());
    if (dist < bestDistance) {
      bestDistance = dist;
      bestMatch = candidate;
    }
  }

  if (bestDistance <= 2 && bestMatch) return bestMatch;

  return null;
}

/**
 * Compute Levenshtein distance between two strings.
 */
function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];

  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,       // deletion
        matrix[i][j - 1] + 1,       // insertion
        matrix[i - 1][j - 1] + cost, // substitution
      );
    }
  }

  return matrix[a.length][b.length];
}

// ============================================================================
// FILTER VALIDATION (D2c: post-extraction, uses parameter context)
// ============================================================================

import type { ParameterContext, FilterValidationResult } from './parameter-context.types';

/**
 * Validate and correct extracted filter parameters using the enriched
 * parameter context (field constraints with known valid values).
 *
 * Checks for each filter:
 * 1. Is the field isFilterable? → if not, drop it
 * 2. Is it a text field with known valid values (isFacetable)?
 *    → verify the value exists in valid values (case-insensitive + substring match)
 *    → if no match, drop the filter and record the reason
 * 3. Is it a numeric/boolean field? → pass through (type coercion handled by validateParameters)
 * 4. Is it filterable but NOT facetable? → pass through (can't verify, search provider handles it)
 */
export function validateFilters(
  filters: Array<{ field: string; operator: string; value: unknown }>,
  paramContext: ParameterContext,
): FilterValidationResult {
  if (filters.length === 0 || Object.keys(paramContext.fieldConstraints).length === 0) {
    return {
      filters,
      droppedFilters: [],
      hasCorrections: false,
      summary: 'No filter validation needed',
    };
  }

  const validatedFilters: Array<{ field: string; operator: string; value: unknown }> = [];
  const droppedFilters: FilterValidationResult['droppedFilters'] = [];
  let hasCorrections = false;

  for (const filter of filters) {
    const constraint = paramContext.fieldConstraints[filter.field];

    // No constraint for this field — it's not a known field in the schema, drop it
    if (!constraint) {
      droppedFilters.push({
        field: filter.field,
        reason: `Field "${filter.field}" is not a known field in the data source schema`,
        originalValue: filter.value,
      });
      hasCorrections = true;
      continue;
    }

    // Check 1: Is the field filterable?
    if (!constraint.isFilterable) {
      droppedFilters.push({
        field: filter.field,
        reason: `Field "${filter.field}" is not filterable`,
        originalValue: filter.value,
      });
      hasCorrections = true;
      continue;
    }

    // Check 2: For text fields with known valid values, verify the value
    if (constraint.fieldType === 'text' && constraint.validValues.length > 0) {
      const filterValue = String(filter.value);
      const matchedValue = matchFilterValue(filterValue, constraint.validValues);

      if (matchedValue) {
        // Value matched (possibly corrected) — use the canonical form
        if (matchedValue !== filterValue) {
          hasCorrections = true;
        }
        validatedFilters.push({
          ...filter,
          value: matchedValue,
        });
      } else {
        // No match — drop the filter
        droppedFilters.push({
          field: filter.field,
          reason: `Value "${filterValue}" not found in known values for "${filter.field}"`,
          originalValue: filter.value,
        });
        hasCorrections = true;
      }
      continue;
    }

    // Check 3 & 4: Numeric, boolean, date, or non-facetable — pass through
    validatedFilters.push(filter);
  }

  const summary = droppedFilters.length > 0
    ? `Dropped ${droppedFilters.length} filter(s): ${droppedFilters.map((d) => `${d.field} (${d.reason})`).join('; ')}`
    : hasCorrections
      ? `Corrected ${filters.length - validatedFilters.length + droppedFilters.length} filter value(s)`
      : 'All filters valid';

  return {
    filters: validatedFilters,
    droppedFilters,
    hasCorrections,
    summary,
  };
}

/**
 * Match a filter value against known valid values.
 * Priority: exact → case-insensitive → substring (value contained in a valid value).
 * Returns the matched canonical value, or null if no match.
 */
function matchFilterValue(value: string, validValues: string[]): string | null {
  // 1. Exact match
  const exact = validValues.find((v) => v === value);
  if (exact) return exact;

  // 2. Case-insensitive match
  const lower = value.toLowerCase();
  const caseMatch = validValues.find((v) => v.toLowerCase() === lower);
  if (caseMatch) return caseMatch;

  // 3. Substring match — the valid value contains the filter value
  //    e.g., "jackets" matches "Men > Jackets"
  const substringMatches = validValues.filter((v) =>
    v.toLowerCase().includes(lower),
  );
  if (substringMatches.length === 1) {
    // Unambiguous substring match
    return substringMatches[0];
  }
  if (substringMatches.length > 1) {
    // Multiple matches — pick the shortest (most specific)
    substringMatches.sort((a, b) => a.length - b.length);
    return substringMatches[0];
  }

  // 4. Reverse substring — the filter value contains a valid value
  //    e.g., "winter jackets for men" matches "winter"
  const reverseMatches = validValues.filter((v) =>
    lower.includes(v.toLowerCase()),
  );
  if (reverseMatches.length === 1) {
    return reverseMatches[0];
  }
  if (reverseMatches.length > 1) {
    reverseMatches.sort((a, b) => b.length - a.length);
    return reverseMatches[0];
  }

  return null;
}

// Exported for testing
export {
  fuzzyMatchEnum as _fuzzyMatchEnum,
  levenshteinDistance as _levenshteinDistance,
  validateField as _validateField,
  matchFilterValue as _matchFilterValue,
  validateFilters as _validateFilters,
};
