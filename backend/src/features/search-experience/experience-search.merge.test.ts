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

import type { SearchHit, SearchResponse } from '@/features/search/search.types';
import { mergeSearchResults, rankHits, type HitOrigin } from './experience-search';

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

describe('mergeSearchResults', () => {
  const response = (hits: SearchHit[]): SearchResponse => ({
    hits,
    total: { value: hits.length, relation: 'eq' },
    took: 1,
    pagination: { page: 1, pageSize: 20, totalPages: 1, totalItems: hits.length, hasNextPage: false, hasPreviousPage: false },
  });
  const catalog: HitOrigin = { id: 'idx-1', name: 'fashion-catalog', kind: 'index' };
  const second: HitOrigin = { id: 'idx-2', name: 'pr56-dup', kind: 'index' };
  const external: HitOrigin = { id: 'ds-1', name: 'External ES', kind: 'external' };

  it('attributes each hit to its own source when ids overlap', () => {
    const hitOrigins = new WeakMap<SearchHit, HitOrigin>();
    const merged = mergeSearchResults(
      [
        { source: { origin: second, weight: 1 }, result: response([hit('PROD-0001', { name: 'dup' }), hit('PROD-0900')]), error: null },
        { source: { origin: catalog, weight: 1 }, result: response([hit('PROD-0001', { name: 'original' }), hit('PROD-0002')]), error: null },
        { source: { origin: external, weight: 1 }, result: response([hit('PROD-0002', { name: 'external' })]), error: null },
      ],
      { query: 'jeans', page: 1, pageSize: 20 },
      { id: 'exp-1' },
      { exact: true, failedSources: [], hitOrigins }
    );

    const label = (h: SearchHit) => `${h.id}@${hitOrigins.get(h)?.name}:${String(h.source.name ?? '')}`;
    expect(merged.hits.map(label).sort()).toEqual([
      'PROD-0001@fashion-catalog:original',
      'PROD-0001@pr56-dup:dup',
      'PROD-0002@External ES:external',
      'PROD-0002@fashion-catalog:',
      'PROD-0900@pr56-dup:',
    ]);
  });

});
