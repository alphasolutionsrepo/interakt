// src/features/search/filter-value.test.ts

import { describe, expect, it } from 'vitest';

import { asFieldType } from './filter-value';

describe('asFieldType', () => {
  it('converts to the field type', () => {
    expect(asFieldType('80', 'number')).toBe(80);
    expect(asFieldType(80, 'number')).toBe(80);
    expect(asFieldType('true', 'boolean')).toBe(true);
    expect(asFieldType(80, 'text')).toBe('80');
  });

  it('refuses blank text for a number field rather than reading it as 0', () => {
    expect(asFieldType('', 'number')).toBeUndefined();
    expect(asFieldType('  ', 'number')).toBeUndefined();
    expect(asFieldType('cheap', 'number')).toBeUndefined();
    expect(asFieldType(Number.NaN, 'number')).toBeUndefined();
  });

  it('refuses null, a list or an object for any field', () => {
    for (const fieldType of ['text', 'number', 'boolean', undefined]) {
      expect(asFieldType(null, fieldType)).toBeUndefined();
      expect(asFieldType(['Red', 'Blue'], fieldType)).toBeUndefined();
      expect(asFieldType([5], fieldType)).toBeUndefined();
      expect(asFieldType({ a: 1 }, fieldType)).toBeUndefined();
    }
  });
});
