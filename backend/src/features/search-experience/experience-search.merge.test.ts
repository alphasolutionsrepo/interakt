// src/features/search-experience/experience-search.merge.test.ts

/**
 * Ranking results from several sources into one list: weighted RRF, an explicit
 * sort, and hits told apart per source.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('@/features/data-source/data-source.service', () => ({}));
vi.mock('@/features/search/search.service', () => ({}));
vi.mock('@/features/search-index/search-index.service', () => ({}));
vi.mock('./external-source-search', () => ({}));
vi.mock('./query-interpreter', () => ({}));

import type { SearchHit } from '@/features/search/search.types';
import { rankHits } from './experience-search';

const hit = (id: string, source: Record<string, unknown> = {}): SearchHit => ({ id, score: 1, source });
const ids = (hits: SearchHit[]) => hits.map((h) => h.id);

describe('rankHits', () => {
  it('interleaves sources by rank', () => {
    const ranked = rankHits([
      { key: 'es', weight: 1, hits: [hit('a'), hit('b')] },
      { key: 'sitecore', weight: 1, hits: [hit('x'), hit('y')] },
    ]);
    expect(ids(ranked)).toEqual(['a', 'x', 'b', 'y']);
  });

  it('lets a heavier source rank first', () => {
    const ranked = rankHits([
      { key: 'es', weight: 1, hits: [hit('a'), hit('b')] },
      { key: 'sitecore', weight: 3, hits: [hit('x'), hit('y')] },
    ]);
    expect(ids(ranked)).toEqual(['x', 'y', 'a', 'b']);
  });

  it('keeps two documents that share an id in different sources', () => {
    const ranked = rankHits([
      { key: 'es', weight: 1, hits: [hit('3', { name: 'ES doc' })] },
      { key: 'sitecore', weight: 1, hits: [hit('3', { name: 'Sitecore page' })] },
    ]);
    expect(ranked.map((h) => h.source.name)).toEqual(['ES doc', 'Sitecore page']);
  });

  it('orders by an explicit sort, missing values last', () => {
    const ranked = rankHits(
      [
        { key: 'es', weight: 1, hits: [hit('a', { price: 30 }), hit('b', { price: 10 })] },
        { key: 'azure', weight: 1, hits: [hit('x', { price: 20 }), hit('y', {})] },
      ],
      [{ field: 'price', direction: 'desc' }],
    );
    expect(ids(ranked)).toEqual(['a', 'x', 'b', 'y']);
  });

  it('treats a _score sort as relevance', () => {
    const ranked = rankHits(
      [
        { key: 'es', weight: 1, hits: [hit('a'), hit('b')] },
        { key: 'azure', weight: 1, hits: [hit('x')] },
      ],
      [{ field: '_score', direction: 'desc' }],
    );
    expect(ids(ranked)).toEqual(['a', 'x', 'b']);
  });
});
