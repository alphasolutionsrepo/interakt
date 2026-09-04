/**
 * Numeric field types must survive both normalization hops.
 *
 * An external data source field passes through two independent switches before
 * anything uses its type: `mapESType` at discovery, whose result is PERSISTED
 * onto the data source record, and `normalizeFieldType` when the parameter
 * context is assembled. Both end in a default that yields `text`, so a numeric
 * spelling missing from either list is treated as free text from then on:
 *
 *   1. it is picked up as a "facetable text field" and its values are
 *      enumerated into the extraction prompt as a filter vocabulary, and
 *   2. `validateFilters` then requires a filter value to match one of those
 *      enumerated values, dropping the filter when it doesn't.
 *
 * Both hops are pinned here because fixing only discovery leaves every already
 * discovered data source broken until someone re-runs discovery.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/shared/logger/logger', () => {
  const mk: any = () => ({
    debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, trace: () => {}, child: mk,
  });
  return { logger: mk(), createLogger: mk, default: mk() };
});

import { _mapESType } from './data-source.service';
import { _DataSourceSearchProvider } from '@/features/pipeline/v2/parameter-context.provider';
import { validateFilters } from '@/features/pipeline/v2/param-validation';
import type {
  FieldConstraint,
  ParameterContext,
} from '@/features/pipeline/v2/parameter-context.types';

const normalize = (t: string): FieldConstraint['fieldType'] =>
  // normalizeFieldType is private; TS access modifiers are compile-time only.
  (new _DataSourceSearchProvider() as unknown as {
    normalizeFieldType(t: string): FieldConstraint['fieldType'];
  }).normalizeFieldType(t);

/** Every scalar numeric field type Elasticsearch supports. */
const ES_NUMERIC_TYPES = [
  'long', 'integer', 'short', 'byte',
  'double', 'float', 'half_float', 'scaled_float',
  'unsigned_long', 'token_count',
];

describe('numeric field type normalization', () => {
  describe('mapESType — at discovery; the result is persisted', () => {
    it.each(ES_NUMERIC_TYPES)('maps %s to number', (esType) => {
      expect(_mapESType(esType)).toBe('number');
    });

    it('leaves the non-numeric mappings as they were', () => {
      expect(_mapESType('text')).toBe('text');
      expect(_mapESType('keyword')).toBe('text');
      expect(_mapESType('search_as_you_type')).toBe('text');
      expect(_mapESType('boolean')).toBe('boolean');
      expect(_mapESType('date')).toBe('date');
      expect(_mapESType('date_nanos')).toBe('date');
      expect(_mapESType('geo_point')).toBe('geo');
      expect(_mapESType('geo_shape')).toBe('geo');
    });

    it('keeps a genuinely unknown type recognizable instead of guessing', () => {
      expect(_mapESType('some_future_type')).toBe('some_future_type');
      expect(_mapESType(undefined)).toBe('unknown');
    });
  });

  describe('normalizeFieldType — runs against the persisted type', () => {
    it.each(ES_NUMERIC_TYPES)('maps a persisted %s to number', (esType) => {
      expect(normalize(esType)).toBe('number');
    });

    it('maps the Azure Edm numerics to number', () => {
      for (const t of ['Edm.Int32', 'Edm.Int64', 'Edm.Double']) {
        expect(normalize(t)).toBe('number');
      }
    });

    it('maps every date spelling to date', () => {
      for (const t of ['date', 'datetime', 'date_nanos', 'Edm.DateTimeOffset']) {
        expect(normalize(t)).toBe('date');
      }
    });

    it('maps booleans to boolean', () => {
      expect(normalize('boolean')).toBe('boolean');
      expect(normalize('Edm.Boolean')).toBe('boolean');
    });

    it('still falls back to text for genuinely non-numeric types', () => {
      for (const t of ['text', 'keyword', 'geo', 'ip', 'some_future_type']) {
        expect(normalize(t)).toBe('text');
      }
    });
  });

  describe('consequence: the filter survives instead of being dropped', () => {
    // Exercises the real check #42 added: validateFilters drops gt/gte/lt/lte
    // against any field whose constraint type is not number or date.
    const contextFor = (esType: string): ParameterContext => ({
      fieldConstraints: {
        popularity: {
          fieldName: 'popularity',
          fieldType: normalize(_mapESType(esType)),
          isFilterable: true,
          isFacetable: false,
          validValues: [],
        },
      },
      enriched: true,
      summary: '',
      durationMs: 0,
    });

    it.each(ES_NUMERIC_TYPES)('keeps "popularity >= 100" on an %s field', (esType) => {
      const result = validateFilters(
        [{ field: 'popularity', operator: 'gte', value: 100 }],
        contextFor(esType),
      );

      expect(result.droppedFilters).toEqual([]);
      expect(result.filters).toEqual([
        { field: 'popularity', operator: 'gte', value: 100 },
      ]);
    });

    it('still drops a range filter on a genuinely textual field', () => {
      const result = validateFilters(
        [{ field: 'popularity', operator: 'gte', value: 100 }],
        contextFor('keyword'),
      );

      expect(result.filters).toEqual([]);
      expect(result.droppedFilters).toHaveLength(1);
    });
  });
});
