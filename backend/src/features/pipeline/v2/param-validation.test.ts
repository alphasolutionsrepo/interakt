import { describe, it, expect, vi } from 'vitest';

vi.mock('@/shared/logger/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import {
  validateParameters,
  _fuzzyMatchEnum,
  _levenshteinDistance,
} from './param-validation';
import type { ParamValidationInput } from './v2.types';
import type { ToolParameterSchema } from '@/features/ai-service/ai-service.types';

// ============================================================================
// FIXTURES
// ============================================================================

const SEARCH_SCHEMA: ToolParameterSchema = {
  type: 'object',
  properties: {
    query: { type: 'string', description: 'Search query' },
    maxPrice: { type: 'number', description: 'Max price' },
    category: { type: 'string', description: 'Category', enum: ['Electronics', 'Clothing', 'Shoes', 'Home'] },
    inStock: { type: 'boolean', description: 'Only in-stock items' },
  },
  required: ['query'],
};

function makeInput(
  params: Record<string, unknown>,
  schema: ToolParameterSchema = SEARCH_SCHEMA,
): ParamValidationInput {
  return { parameters: params, inputSchema: schema };
}

// ============================================================================
// TESTS
// ============================================================================

describe('D2b: Parameter Validation', () => {
  describe('validateParameters — valid inputs', () => {
    it('accepts valid parameters', () => {
      const result = validateParameters(makeInput({ query: 'red shoes', maxPrice: 50, category: 'Shoes' }));
      expect(result.success).toBe(true);
      expect(result.data!.valid).toBe(true);
      expect(result.data!.errors).toEqual([]);
    });

    it('accepts minimal required-only parameters', () => {
      const result = validateParameters(makeInput({ query: 'shoes' }));
      expect(result.data!.valid).toBe(true);
    });
  });

  describe('validateParameters — required fields', () => {
    it('rejects missing required field', () => {
      const result = validateParameters(makeInput({ maxPrice: 50 }));
      expect(result.data!.valid).toBe(false);
      expect(result.data!.errors).toHaveLength(1);
      expect(result.data!.errors[0].field).toBe('query');
      expect(result.data!.errors[0].message).toContain('missing');
    });

    it('rejects empty string for required field', () => {
      const result = validateParameters(makeInput({ query: '' }));
      expect(result.data!.valid).toBe(false);
    });

    it('rejects null for required field', () => {
      const result = validateParameters(makeInput({ query: null }));
      expect(result.data!.valid).toBe(false);
    });
  });

  describe('validateParameters — type coercion', () => {
    it('coerces string "50" to number 50', () => {
      const result = validateParameters(makeInput({ query: 'shoes', maxPrice: '50' }));
      expect(result.data!.valid).toBe(true);
      expect(result.data!.parameters.maxPrice).toBe(50);
    });

    it('coerces "$99.99" to 99.99 (strips currency)', () => {
      const result = validateParameters(makeInput({ query: 'shoes', maxPrice: '$99.99' }));
      expect(result.data!.valid).toBe(true);
      expect(result.data!.parameters.maxPrice).toBe(99.99);
    });

    it('coerces "1,500" to 1500 (strips comma)', () => {
      const result = validateParameters(makeInput({ query: 'shoes', maxPrice: '1,500' }));
      expect(result.data!.parameters.maxPrice).toBe(1500);
    });

    it('rejects non-numeric string for number field', () => {
      const result = validateParameters(makeInput({ query: 'shoes', maxPrice: 'cheap' }));
      expect(result.data!.valid).toBe(false);
      expect(result.data!.errors[0].field).toBe('maxPrice');
    });

    it('coerces "true" string to boolean true', () => {
      const result = validateParameters(makeInput({ query: 'shoes', inStock: 'true' }));
      expect(result.data!.parameters.inStock).toBe(true);
    });

    it('coerces "yes" to boolean true', () => {
      const result = validateParameters(makeInput({ query: 'shoes', inStock: 'yes' }));
      expect(result.data!.parameters.inStock).toBe(true);
    });

    it('coerces "false" string to boolean false', () => {
      const result = validateParameters(makeInput({ query: 'shoes', inStock: 'false' }));
      expect(result.data!.parameters.inStock).toBe(false);
    });

    it('rejects invalid boolean string', () => {
      const result = validateParameters(makeInput({ query: 'shoes', inStock: 'maybe' }));
      expect(result.data!.valid).toBe(false);
    });
  });

  describe('validateParameters — enum validation (exact & case-insensitive)', () => {
    it('accepts exact enum match', () => {
      const result = validateParameters(makeInput({ query: 'shoes', category: 'Shoes' }));
      expect(result.data!.valid).toBe(true);
      expect(result.data!.parameters.category).toBe('Shoes');
    });

    it('corrects case-insensitive enum match', () => {
      const result = validateParameters(makeInput({ query: 'shoes', category: 'shoes' }));
      expect(result.data!.valid).toBe(true);
      expect(result.data!.parameters.category).toBe('Shoes');
    });

    it('corrects UPPERCASE enum match', () => {
      const result = validateParameters(makeInput({ query: 'shoes', category: 'ELECTRONICS' }));
      expect(result.data!.valid).toBe(true);
      expect(result.data!.parameters.category).toBe('Electronics');
    });
  });

  describe('validateParameters — fuzzy enum matching (Levenshtein)', () => {
    it('corrects "Electornics" → "Electronics" (distance 2)', () => {
      const result = validateParameters(makeInput({ query: 'laptop', category: 'Electornics' }));
      expect(result.data!.valid).toBe(true);
      expect(result.data!.parameters.category).toBe('Electronics');
    });

    it('corrects "Clohing" → "Clothing" (distance 1)', () => {
      const result = validateParameters(makeInput({ query: 'shirt', category: 'Clohing' }));
      expect(result.data!.valid).toBe(true);
      expect(result.data!.parameters.category).toBe('Clothing');
    });

    it('rejects value too far from any enum (distance > 2)', () => {
      const result = validateParameters(makeInput({ query: 'thing', category: 'Automotive' }));
      expect(result.data!.valid).toBe(false);
      expect(result.data!.errors[0].field).toBe('category');
      expect(result.data!.errors[0].expected).toContain('Electronics');
    });
  });

  describe('validateParameters — unknown fields', () => {
    it('strips fields not in schema', () => {
      const result = validateParameters(makeInput({
        query: 'shoes',
        unknownField: 'should be removed',
        anotherOne: 42,
      }));
      expect(result.data!.valid).toBe(true);
      expect(result.data!.parameters).not.toHaveProperty('unknownField');
      expect(result.data!.parameters).not.toHaveProperty('anotherOne');
      expect(result.data!.parameters.query).toBe('shoes');
    });
  });

  describe('validateParameters — array fields', () => {
    it('validates array type', () => {
      const schema: ToolParameterSchema = {
        type: 'object',
        properties: {
          ids: { type: 'array', description: 'IDs', items: { type: 'string' } },
        },
        required: ['ids'],
      };
      const result = validateParameters(makeInput({ ids: ['a', 'b', 'c'] }, schema));
      expect(result.data!.valid).toBe(true);
    });

    it('rejects non-array for array field', () => {
      const schema: ToolParameterSchema = {
        type: 'object',
        properties: {
          ids: { type: 'array', description: 'IDs', items: { type: 'string' } },
        },
        required: ['ids'],
      };
      const result = validateParameters(makeInput({ ids: 'not-an-array' }, schema));
      expect(result.data!.valid).toBe(false);
      expect(result.data!.errors[0].field).toBe('ids');
    });
  });

  describe('validateParameters — nested objects', () => {
    it('validates nested object properties', () => {
      const schema: ToolParameterSchema = {
        type: 'object',
        properties: {
          filters: {
            type: 'object',
            description: 'Filters',
            properties: {
              color: { type: 'string', description: 'Color' },
              minPrice: { type: 'number', description: 'Min price' },
            },
            required: ['color'],
          },
        },
        required: ['filters'],
      };
      const result = validateParameters(makeInput({
        filters: { color: 'red', minPrice: '25' },
      }, schema));
      expect(result.data!.valid).toBe(true);
      // minPrice should be coerced
      expect((result.data!.parameters.filters as any).minPrice).toBe(25);
    });

    it('rejects missing required nested field', () => {
      const schema: ToolParameterSchema = {
        type: 'object',
        properties: {
          filters: {
            type: 'object',
            description: 'Filters',
            properties: {
              color: { type: 'string', description: 'Color' },
            },
            required: ['color'],
          },
        },
        required: ['filters'],
      };
      const result = validateParameters(makeInput({ filters: {} }, schema));
      expect(result.data!.valid).toBe(false);
      expect(result.data!.errors[0].field).toBe('filters.color');
    });
  });

  describe('_fuzzyMatchEnum', () => {
    const allowed = ['Electronics', 'Clothing', 'Shoes', 'Home'];

    it('returns exact match', () => {
      expect(_fuzzyMatchEnum('Electronics', allowed)).toBe('Electronics');
    });

    it('returns case-insensitive match', () => {
      expect(_fuzzyMatchEnum('electronics', allowed)).toBe('Electronics');
    });

    it('returns Levenshtein match within distance 2', () => {
      expect(_fuzzyMatchEnum('Electornics', allowed)).toBe('Electronics');
    });

    it('returns null for no match', () => {
      expect(_fuzzyMatchEnum('Automotive', allowed)).toBeNull();
    });

    it('returns closest match when multiple are close', () => {
      expect(_fuzzyMatchEnum('Hom', ['Home', 'Hot'])).toBe('Home');
    });
  });

  describe('_levenshteinDistance', () => {
    it('returns 0 for identical strings', () => {
      expect(_levenshteinDistance('abc', 'abc')).toBe(0);
    });

    it('returns string length for empty vs non-empty', () => {
      expect(_levenshteinDistance('', 'abc')).toBe(3);
      expect(_levenshteinDistance('abc', '')).toBe(3);
    });

    it('returns 1 for single character difference', () => {
      expect(_levenshteinDistance('cat', 'car')).toBe(1);
    });

    it('returns 2 for two character differences', () => {
      expect(_levenshteinDistance('kitten', 'mitten')).toBe(1);
      expect(_levenshteinDistance('electornics', 'electronics')).toBe(2);
    });
  });

  describe('module result', () => {
    it('includes duration', () => {
      const result = validateParameters(makeInput({ query: 'shoes' }));
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('includes summary with error fields', () => {
      const result = validateParameters(makeInput({}));
      expect(result.summary).toContain('query');
    });
  });
});
