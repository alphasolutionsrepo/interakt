// src/features/search/providers/azure-ai-search/azure-engine.provider.get-index-mapping.test.ts

/**
 * The document indexer deletes and recreates an index whose mapping reports no
 * embedding dimensions. Azure must therefore surface the vector field's dimensions
 * from getIndex(), or every batch push wipes the index (seen on a live service, 27 Oct).
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/shared/logger/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
const { getIndex } = vi.hoisted(() => ({ getIndex: vi.fn() }));
vi.mock('./azure-client', () => ({
  getIndexClient: () => ({ getIndex }),
  getSearchClient: vi.fn(),
  checkAzureHealth: vi.fn(),
}));

import { AzureEngineProvider } from './azure-engine.provider';

describe('AzureEngineProvider.getIndexMapping', () => {
  const provider = new AzureEngineProvider();

  it('reports the dimensions of the content_embedding vector field', async () => {
    getIndex.mockResolvedValueOnce({
      name: 'idx',
      fields: [
        { name: 'id', type: 'Edm.String', key: true },
        { name: 'title', type: 'Edm.String', searchable: true },
        {
          name: 'content_embedding',
          type: 'Collection(Edm.Single)',
          searchable: true,
          vectorSearchDimensions: 1536,
          vectorSearchProfileName: 'default-vector-profile',
        },
      ],
    });

    const result = await provider.getIndexMapping('idx');

    expect(result.success).toBe(true);
    expect(result.embeddingDimensions).toBe(1536);
  });

  it('reports no dimensions when the index has no vector field', async () => {
    getIndex.mockResolvedValueOnce({
      name: 'idx',
      fields: [
        { name: 'id', type: 'Edm.String', key: true },
        { name: 'title', type: 'Edm.String', searchable: true },
      ],
    });

    const result = await provider.getIndexMapping('idx');

    expect(result.success).toBe(true);
    expect(result.embeddingDimensions).toBeUndefined();
  });

  it('ignores vector fields under other names when content_embedding is missing', async () => {
    getIndex.mockResolvedValueOnce({
      name: 'idx',
      fields: [
        { name: 'id', type: 'Edm.String', key: true },
        {
          name: 'title_vector',
          type: 'Collection(Edm.Single)',
          searchable: true,
          vectorSearchDimensions: 768,
          vectorSearchProfileName: 'default-vector-profile',
        },
      ],
    });

    const result = await provider.getIndexMapping('idx');

    expect(result.success).toBe(true);
    expect(result.embeddingDimensions).toBeUndefined();
  });

  it('returns failures as errors', async () => {
    getIndex.mockRejectedValueOnce(new Error('Not Found'));

    expect(await provider.getIndexMapping('idx')).toEqual({ success: false, error: 'Not Found' });
  });
});
