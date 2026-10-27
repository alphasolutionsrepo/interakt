// src/features/tools/executors/data-source/file-store.vector-db-error.test.ts

/**
 * A database error in the search by meaning is not an embedding failure: the search fails and
 * the error is logged, even when the words matched passages.
 */

import { describe, it, expect, vi } from 'vitest';

const logError = vi.hoisted(() => vi.fn());
vi.mock('@/shared/logger/logger', () => ({
  createLogger: () => ({ error: logError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/features/embedding/embedding.service', () => ({ embed: vi.fn(async () => [0.1, 0.2]) }));
vi.mock('@/features/analytics', () => ({ trackSearch: vi.fn() }));
vi.mock('@/features/search/search.service', () => ({ getExperienceContext: () => undefined }));
vi.mock('@/features/knowledge-base/knowledge-base.repository', () => ({
  searchChunks: vi.fn(async () => { throw new Error('relation "kb_chunks" does not exist'); }),
  keywordSearchChunks: vi.fn(async () => [
    { id: 'c1', content: 'Warranty lasts two years', chunkIndex: 0, documentId: 'd1', documentName: 'Policy' },
  ]),
}));

import { trackSearch } from '@/features/analytics';
import { executeFileStoreSearch } from './file-store';

describe('file-store search when the search by meaning hits a database error', () => {
  it('fails, is recorded as failed, and logs the error instead of returning keyword-only results', async () => {
    const result = await executeFileStoreSearch('ds', {}, { query: 'warranty' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('kb_chunks');
    expect(logError).toHaveBeenCalledWith('File store search failed', expect.any(Error), { dataSourceId: 'ds' });
    expect(trackSearch).toHaveBeenCalledWith(expect.objectContaining({ success: false }), undefined);
  });
});
