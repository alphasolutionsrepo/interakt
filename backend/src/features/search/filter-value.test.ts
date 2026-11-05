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

  it('reads number text as JSON writes numbers', () => {
    expect(asFieldType(' -12.5 ', 'number')).toBe(-12.5);
    expect(asFieldType('0', 'number')).toBe(0);
    expect(asFieldType('1e3', 'number')).toBe(1000);
    expect(asFieldType('2.5E-1', 'number')).toBe(0.25);
    for (const text of ['0x7E8', '0b11111101000', '0o3750', '+5', '007', '.5', '5.', 'Infinity', '1e999']) {
      expect(asFieldType(text, 'number')).toBeUndefined();
    }
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
