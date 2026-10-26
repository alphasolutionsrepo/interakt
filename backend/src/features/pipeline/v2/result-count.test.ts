import { describe, it, expect } from 'vitest';

import { singleRecordCount } from './result-count';

describe('singleRecordCount', () => {
  it('counts a lookup that found nothing as zero', () => {
    expect(singleRecordCount({ found: false, requested: 'XYZ-999' })).toBe(0);
  });

  it('counts a lookup with its record as one', () => {
    expect(singleRecordCount({ id: 'p1', document: { name: 'Denim Jacket' } })).toBe(1);
  });

  it('counts a lookup that several items fit by its list of matches', () => {
    expect(singleRecordCount({ found: false, matches: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] })).toBe(3);
  });

  it('leaves lists and other shapes to the caller', () => {
    expect(singleRecordCount({ results: [] })).toBeUndefined();
    expect(singleRecordCount([{ id: 'p1' }])).toBeUndefined();
    expect(singleRecordCount(null)).toBeUndefined();
  });
});
