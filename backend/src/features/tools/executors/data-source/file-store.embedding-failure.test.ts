// src/features/tools/executors/data-source/file-store.embedding-failure.test.ts

/**
 * When the embedding call itself fails (no provider, provider down), the real embedding helper
 * returns nothing and file-store search treats the search by meaning as failed: with no passage
 * matching the words, the search is a failure, not "nothing found".
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('@/features/ai-service/ai-service.service', () => ({
  generateEmbedding: vi.fn(async () => { throw new Error('No embedding provider configured'); }),
  generateEmbeddings: vi.fn(),
}));
vi.mock('@/features/analytics', () => ({ trackSearch: vi.fn() }));
vi.mock('@/features/search/search.service', () => ({ getExperienceContext: () => undefined }));
vi.mock('@/features/knowledge-base/knowledge-base.repository', () => ({
  searchChunks: vi.fn(async () => []),
  keywordSearchChunks: vi.fn(async () => []),
}));

import { trackSearch } from '@/features/analytics';
import * as kbRepository from '@/features/knowledge-base/knowledge-base.repository';
import { executeFileStoreSearch } from './file-store';

describe('file-store search when the embedding call fails', () => {
  it('is a failed search, recorded as failed, and never reaches the search by meaning', async () => {
    const result = await executeFileStoreSearch('ds', {}, { query: 'warranty' });

    expect(result.success).toBe(false);
    expect(kbRepository.searchChunks).not.toHaveBeenCalled();
    expect(trackSearch).toHaveBeenCalledWith(expect.objectContaining({ success: false, totalResults: 0 }), undefined);
  });
});
