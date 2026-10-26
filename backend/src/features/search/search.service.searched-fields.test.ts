// src/features/search/search.service.searched-fields.test.ts

/**
 * search() validates each request before the engine sees it. A request option the validation
 * doesn't know is dropped there, so this runs the real search() and checks what the engine gets.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/shared/logger/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('@/features/ai-service', () => ({ generateEmbedding: vi.fn() }));
vi.mock('@/features/analytics', () => ({ trackSearch: vi.fn() }));
vi.mock('./search.tracing', () => ({
  traceSearch: (_meta: unknown, run: (span: { setAttribute: () => void }) => unknown) => run({ setAttribute: vi.fn() }),
}));
vi.mock('./response.normalizer', () => ({ normalizeSearchResponse: () => ({ hits: [], total: { value: 0 } }) }));
vi.mock('@/features/search-index/search-index.service', () => ({
  getSearchIndexById: vi.fn(async () => ({ id: 'idx', name: 'products', isActive: true, status: 'active' })),
}));
vi.mock('./search-context.builder', () => ({
  buildSearchContext: () => ({ indexName: 'products', searchType: 'lexical', searchProvider: 'elasticsearch' }),
  supportsSemanticSearch: () => false,
}));
const { engineSearch } = vi.hoisted(() => ({ engineSearch: vi.fn(async () => ({ hits: [], total: 0 })) }));
vi.mock('./providers', () => {
  const engine = { name: 'elasticsearch', search: engineSearch };
  return { providerRegistry: { list: () => [engine], get: () => engine }, initializeSearchProviders: vi.fn() };
});

import { searchById } from './search.service';

describe('search request options', () => {
  it('passes a request for the searched fields on to the engine', async () => {
    await searchById('idx', { query: 'ABC-123', includeSearchedFields: true });

    expect(engineSearch).toHaveBeenCalledWith(
      expect.objectContaining({ request: expect.objectContaining({ includeSearchedFields: true }) }),
    );
  });
});
