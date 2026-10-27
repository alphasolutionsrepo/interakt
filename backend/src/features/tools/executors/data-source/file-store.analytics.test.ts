// src/features/tools/executors/data-source/file-store.analytics.test.ts

/**
 * A Search tool search on a file store is recorded like one on any other source, so reports
 * see the assistant's file-store searches, with the turn's source and experience.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { trackSearch } = vi.hoisted(() => ({ trackSearch: vi.fn() }));
vi.mock('@/features/analytics', () => ({ trackSearch }));
vi.mock('@/features/search/search.service', () => ({ getExperienceContext: () => ({ experienceId: 'exp', experienceSlug: 'shop' }) }));
vi.mock('@/features/embedding/embedding.service', () => ({ embed: vi.fn(async () => [0.1, 0.2]) }));
vi.mock('@/features/knowledge-base/knowledge-base.repository', () => ({
  searchChunks: vi.fn(async () => [{ id: 'c1', content: 'Returns within 30 days', chunkIndex: 0, documentId: 'd1', documentName: 'policy.pdf' }]),
  keywordSearchChunks: vi.fn(async () => []),
}));

import { withAnalyticsSource } from '@/features/analytics/analytics-source-context';
import * as kbRepository from '@/features/knowledge-base/knowledge-base.repository';
import { executeFileStoreSearch } from './file-store';

beforeEach(() => trackSearch.mockClear());

describe('file-store search analytics', () => {
  it('records the search as the Search tool’s, with the turn’s source and experience', async () => {
    const result = await withAnalyticsSource('admin_test', () => executeFileStoreSearch('ds', {}, { query: ' return policy ' }));

    expect(result.success).toBe(true);
    expect(trackSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        triggerType: 'ai_tool', triggerStep: 'search', source: 'admin_test', indexIds: ['ds'],
        experienceId: 'exp', queryText: 'return policy', totalResults: 1, resultsReturned: 1, success: true,
      }),
      'exp',
    );
  });

  it('records a search that found nothing, and one that failed', async () => {
    vi.mocked(kbRepository.searchChunks).mockResolvedValue([]);
    await executeFileStoreSearch('ds', {}, { query: 'warranty' });
    vi.mocked(kbRepository.keywordSearchChunks).mockRejectedValueOnce(new Error('db down'));
    await executeFileStoreSearch('ds', {}, { query: 'warranty' });

    expect(trackSearch.mock.calls.map(([event]) => [event.totalResults, event.success, event.errorMessage])).toEqual([
      [0, true, undefined],
      [0, false, 'db down'],
    ]);
  });

  it('records a search whose embedding failed and whose words matched nothing as failed', async () => {
    trackSearch.mockClear();
    const { embed } = await import('@/features/embedding/embedding.service');
    vi.mocked(embed).mockResolvedValueOnce(null);
    vi.mocked(kbRepository.keywordSearchChunks).mockResolvedValueOnce([]);

    const result = await executeFileStoreSearch('ds', {}, { query: 'warranty' });

    expect(result.success).toBe(false);
    expect(trackSearch).toHaveBeenCalledWith(expect.objectContaining({ success: false, totalResults: 0 }), 'exp');
  });
});
