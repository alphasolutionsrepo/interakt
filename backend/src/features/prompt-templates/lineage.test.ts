import { describe, expect, it } from 'vitest';

import { collectLineage } from './prompt-template.repository';

/**
 * Version history used to be built by walking up the parent chain from whichever version was
 * open, so what you saw depended on where you stood: from the newest version the history was
 * complete, from an older one every version after it was invisible. An old version is exactly
 * where you stand when you want to roll forward, so the case that broke was the one that
 * mattered.
 */

const v = (id: string, parentId: string | null, version: number) => ({ id, parentId, version });

/** A straight chain v1 → v2 → v3 → v4. */
const chain = [
  v('a', null, 1),
  v('b', 'a', 2),
  v('c', 'b', 3),
  v('d', 'c', 4),
];

describe('collectLineage', () => {
  it('returns the whole lineage from the newest version', () => {
    expect(collectLineage(chain, 'd').map((r) => r.version)).toEqual([4, 3, 2, 1]);
  });

  it('returns the whole lineage from an older version', () => {
    // The regression: standing on v3 previously hid v4 entirely, so there was nothing to
    // roll forward to.
    expect(collectLineage(chain, 'b').map((r) => r.version)).toEqual([4, 3, 2, 1]);
    expect(collectLineage(chain, 'a').map((r) => r.version)).toEqual([4, 3, 2, 1]);
  });

  it('includes both sides of a branch', () => {
    // Two versions can share a parent when one is authored from a rolled-back state.
    const branched = [...chain, v('e', 'b', 5)];
    expect(collectLineage(branched, 'a').map((r) => r.version)).toEqual([5, 4, 3, 2, 1]);
    expect(collectLineage(branched, 'e').map((r) => r.version)).toEqual([5, 4, 3, 2, 1]);
  });

  it('excludes rows from an unrelated lineage', () => {
    // Same step, different root — a separate template, not a version of this one.
    const unrelated = [...chain, v('x', null, 1), v('y', 'x', 2)];
    expect(collectLineage(unrelated, 'c').map((r) => r.id)).toEqual(['d', 'c', 'b', 'a']);
    expect(collectLineage(unrelated, 'y').map((r) => r.id)).toEqual(['y', 'x']);
  });

  it('returns an empty history for an id that is not present', () => {
    expect(collectLineage(chain, 'missing')).toEqual([]);
    expect(collectLineage([], 'a')).toEqual([]);
  });

  it('truncates rather than losing everything when an ancestor is missing', () => {
    // A pruned parent should not take its descendants down with it.
    const orphaned = [v('b', 'gone', 2), v('c', 'b', 3)];
    expect(collectLineage(orphaned, 'c').map((r) => r.version)).toEqual([3, 2]);
  });

  it('terminates on a parent cycle instead of hanging', () => {
    // The schema does not prevent one, and a hung request is worse than a short history.
    const cyclic = [v('a', 'b', 1), v('b', 'a', 2)];
    expect(collectLineage(cyclic, 'a').length).toBeGreaterThan(0);
  });

  it('does not duplicate a row reachable by more than one path', () => {
    const branched = [...chain, v('e', 'b', 5)];
    const ids = collectLineage(branched, 'd').map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
