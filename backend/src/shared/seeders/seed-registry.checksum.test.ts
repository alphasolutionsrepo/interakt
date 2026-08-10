import { describe, expect, it } from 'vitest';

import { calculateChecksum } from './seed-registry.service';

/**
 * The checksum is the only thing standing between an edited seed source and a stale database.
 * It previously used `JSON.stringify(data, Object.keys(data).sort())`, where the array argument
 * is a property allow-list applied at every depth rather than a key sort — so nested content
 * was dropped before hashing and no edit to it could ever change the result.
 */
describe('calculateChecksum', () => {
  it('changes when nested content changes', () => {
    // The exact shape the docs seeder hashes. This is the case that silently did not work:
    // all 52 pages could be rewritten and the checksum would not move.
    const before = calculateChecksum({
      docs: [{ slug: 'concepts/guardrails', content: 'original text' }],
      embeddingModelId: 9,
    });
    const after = calculateChecksum({
      docs: [{ slug: 'concepts/guardrails', content: 'rewritten text' }],
      embeddingModelId: 9,
    });

    expect(after).not.toBe(before);
  });

  it('changes when a nested key is renamed', () => {
    expect(calculateChecksum({ a: [{ x: 1 }] })).not.toBe(calculateChecksum({ a: [{ y: 1 }] }));
  });

  it('is stable across key ordering at every depth', () => {
    // Two objects that differ only in declaration order must hash the same, or every seeder
    // re-runs on an unrelated refactor.
    const a = calculateChecksum({ outer: { one: 1, two: { alpha: 'a', beta: 'b' } }, id: 3 });
    const b = calculateChecksum({ id: 3, outer: { two: { beta: 'b', alpha: 'a' }, one: 1 } });

    expect(a).toBe(b);
  });

  it('respects array order', () => {
    // Arrays are sequences, not sets — a reordered pipeline is a different pipeline.
    expect(calculateChecksum([1, 2])).not.toBe(calculateChecksum([2, 1]));
  });

  it('distinguishes values that share a loose string form', () => {
    expect(calculateChecksum({ v: 1 })).not.toBe(calculateChecksum({ v: '1' }));
    expect(calculateChecksum({ v: null })).not.toBe(calculateChecksum({ v: 'null' }));
  });

  it('handles primitives and empty structures without throwing', () => {
    expect(calculateChecksum(null)).toEqual(expect.any(String));
    expect(calculateChecksum('x')).toEqual(expect.any(String));
    expect(calculateChecksum({})).not.toBe(calculateChecksum([]));
  });
});
