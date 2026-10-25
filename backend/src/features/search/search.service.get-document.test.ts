// src/features/search/search.service.get-document.test.ts

/**
 * What Find Record gets from the search service when it fetches a key on an Azure index:
 * a key Azure doesn't have is no document (the lookup then searches for the item by name);
 * any other failure rejects (the lookup is retried and labelled failed). Runs the real
 * service and Azure provider; only the Azure client and the index row are stubbed.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/shared/logger/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('@/features/ai-service', () => ({ generateEmbedding: vi.fn() }));
vi.mock('@/features/analytics', () => ({ trackSearch: vi.fn() }));
vi.mock('./search.tracing', () => ({ traceSearch: vi.fn() }));
vi.mock('@/features/search-index/search-index.service', () => ({
  getSearchIndexById: vi.fn(async () => ({ id: 'idx', name: 'products', isActive: true, status: 'active' })),
}));
vi.mock('./search-context.builder', () => ({
  buildSearchContext: () => ({ indexName: 'products', defaultResponseFields: [], searchProvider: 'azure-ai-search' }),
  supportsSemanticSearch: () => false,
}));
const { getDocument } = vi.hoisted(() => ({ getDocument: vi.fn() }));
vi.mock('./providers/azure-ai-search/azure-client', () => ({ getSearchClient: () => ({ getDocument }), checkAzureHealth: vi.fn() }));
vi.mock('./providers', async () => {
  const { AzureSearchProvider } = await import('./providers/azure-ai-search/azure-search.provider');
  const azure = new AzureSearchProvider();
  return { providerRegistry: { list: () => [azure], get: () => azure }, initializeSearchProviders: vi.fn() };
});

import { getDocumentByIdFromIndex } from './search.service';

describe('getDocumentByIdFromIndex on an Azure index', () => {
  it('returns no document for a key Azure does not have', async () => {
    getDocument.mockRejectedValueOnce(Object.assign(new Error('Not Found'), { statusCode: 404 }));

    expect(await getDocumentByIdFromIndex('idx', 'Vesper & Co Crew Neck Sweater')).toBeNull();
  });

  it('rejects on any other failure', async () => {
    getDocument.mockRejectedValueOnce(Object.assign(new Error('Service Unavailable'), { statusCode: 503 }));

    await expect(getDocumentByIdFromIndex('idx', 'PROD-1')).rejects.toThrow('Service Unavailable');
  });
});
