import { describe, it, expect } from 'vitest';
import { parseSortInput } from './sort-clause.util';

describe('parseSortInput', () => {
  it('returns [] for empty / nullish input', () => {
    expect(parseSortInput(undefined)).toEqual([]);
    expect(parseSortInput('')).toEqual([]);
    expect(parseSortInput([])).toEqual([]);
  });

  it('parses space-separated "field direction" (the AI-generated form that previously broke)', () => {
    // Regression: this used to yield { field: "publishDate desc" } -> Azure "publishDate desc asc"
    expect(parseSortInput('publishDate desc')).toEqual([
      { field: 'publishDate', direction: 'desc' },
    ]);
  });

  it('parses colon-separated "field:direction"', () => {
    expect(parseSortInput('publishDate:desc')).toEqual([
      { field: 'publishDate', direction: 'desc' },
    ]);
  });

  it('defaults to asc for a bare field', () => {
    expect(parseSortInput('publishDate')).toEqual([
      { field: 'publishDate', direction: 'asc' },
    ]);
  });

  it('normalizes direction casing and stray whitespace', () => {
    expect(parseSortInput('  price   DESC  ')).toEqual([
      { field: 'price', direction: 'desc' },
    ]);
  });

  it('treats unrecognized direction tokens as the default (asc)', () => {
    expect(parseSortInput('price downward')).toEqual([
      { field: 'price', direction: 'asc' },
    ]);
  });

  it('parses multiple comma-separated clauses', () => {
    expect(parseSortInput('price asc, publishDate desc')).toEqual([
      { field: 'price', direction: 'asc' },
      { field: 'publishDate', direction: 'desc' },
    ]);
  });

  it('parses the structured array form', () => {
    expect(parseSortInput([{ field: 'price', direction: 'desc' }])).toEqual([
      { field: 'price', direction: 'desc' },
    ]);
  });

  it('honors an object-level direction when the field token has none', () => {
    expect(parseSortInput([{ field: 'price' }])).toEqual([
      { field: 'price', direction: 'asc' },
    ]);
    expect(parseSortInput([{ field: 'price', direction: 'desc' }])).toEqual([
      { field: 'price', direction: 'desc' },
    ]);
  });

  it('lets a direction embedded in the field token win over the object direction', () => {
    expect(parseSortInput([{ field: 'price desc', direction: 'asc' }])).toEqual([
      { field: 'price', direction: 'desc' },
    ]);
  });

  it('drops entries with no usable field token', () => {
    expect(parseSortInput([{ field: '' }, { field: '   ' }])).toEqual([]);
    expect(parseSortInput(', ,')).toEqual([]);
  });
});
