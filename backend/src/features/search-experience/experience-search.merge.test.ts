// src/features/search-experience/experience-search.merge.test.ts

/**
 * Ranking results from several sources into one list: weighted RRF, an explicit
 * sort, and hits told apart per source.
 */

import { describe, it, expect, vi } from 'vitest';

import { reported, type LogLine } from '@/shared/test/log-recorder';

const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
vi.mock('@/features/data-source/data-source.service', () => ({}));
vi.mock('@/features/search/search.service', () => ({}));
vi.mock('@/features/search-index/search-index.service', () => ({}));
vi.mock('./external-source-search', () => ({}));
vi.mock('./query-interpreter', () => ({}));

import { SearchError, type SearchHit, type SearchResponse } from '@/features/search/search.types';
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

  it('drops a source that refused the request and marks the result partial', () => {
    const hitOrigins = new WeakMap<SearchHit, HitOrigin>();
    const failedSources: HitOrigin[] = [];
    const merged = mergeSearchResults(
      [
        { source: { origin: catalog, weight: 1 }, result: response([]), error: null },
        { source: { origin: external, weight: 1 }, result: null, error: new Error('INVALID_FILTER') },
      ],
      { query: 'jeans', page: 1, pageSize: 20, filters: [{ field: 'title', operator: 'eq', value: 'zzz' }] },
      { id: 'exp-1' },
      { exact: true, failedSources, hitOrigins }
    );
    expect(merged.hits).toEqual([]);
    expect(failedSources).toEqual([external]);
  });

  it('logs why each other source failed when every source failed, since the answer carries only the first', () => {
    logs.length = 0;
    const down = new Error('connect ECONNREFUSED');
    const rejected = new Error('Azure AI Search rejected the request — check the API key');
    expect(() => mergeSearchResults(
      [
        { source: { origin: catalog, weight: 1 }, result: null, error: down },
        { source: { origin: external, weight: 1 }, result: null, error: rejected },
      ],
      { query: 'jeans', page: 1, pageSize: 20 },
      { id: 'exp-1' },
      { exact: true, failedSources: [], hitOrigins: new WeakMap() }
    )).toThrow(down);
    expect(reported(logs)).toEqual([
      expect.objectContaining({ level: 'warn', context: expect.objectContaining({ sourceId: 'ds-1', err: rejected }) }),
    ]);
  });

  it('logs why a source failed when the others still answered, since nothing else does', () => {
    logs.length = 0;
    const refused = new Error('failed to create query: For input string: "zzz"');
    mergeSearchResults(
      [
        { source: { origin: catalog, weight: 1 }, result: response([]), error: null },
        { source: { origin: external, weight: 1 }, result: null, error: refused },
      ],
      { query: 'jeans', page: 1, pageSize: 20 },
      { id: 'exp-1' },
      { exact: true, failedSources: [], hitOrigins: new WeakMap() }
    );
    expect(reported(logs)).toEqual([
      expect.objectContaining({ level: 'warn', context: expect.objectContaining({ experienceId: 'exp-1', sourceId: 'ds-1', err: refused }) }),
    ]);
  });

  it('logs a source that failed on our side as an error, so an outage that only makes answers partial still shows', () => {
    logs.length = 0;
    // What a managed index throws when its query embedding's AI provider is down
    const aiDown = Object.assign(new Error('503 Service Unavailable'), { name: 'AdapterError', providerKey: 'openai', statusCode: 503 });
    const failed = new SearchError('Failed to generate query embedding', 'EMBEDDING_FAILED', {}, { cause: aiDown });
    mergeSearchResults(
      [
        { source: { origin: catalog, weight: 1 }, result: null, error: failed },
        { source: { origin: external, weight: 1 }, result: response([]), error: null },
      ],
      { query: 'jeans', page: 1, pageSize: 20 },
      { id: 'exp-1' },
      { exact: true, failedSources: [], hitOrigins: new WeakMap() }
    );
    expect(reported(logs)).toEqual([
      expect.objectContaining({ level: 'error', context: expect.objectContaining({ sourceId: 'idx-1', err: failed }) }),
    ]);
  });
});
