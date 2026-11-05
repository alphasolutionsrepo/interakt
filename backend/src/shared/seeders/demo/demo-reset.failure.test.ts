// src/shared/seeders/demo/demo-reset.failure.test.ts

/**
 * Resetting the demo drops its index in the search engine last. The engine passes a
 * failed delete on instead of logging it, so the reset reports it: a warning with the
 * engine's error, and the index is not counted as deleted.
 */

import { describe, expect, it, vi } from 'vitest';

import { reported, type LogLine } from '@/shared/test/log-recorder';

vi.mock('server-only', () => ({}));
const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
vi.mock('@/db/index', () => ({ db: {} }));
vi.mock('@/features/ai-experience/ai-experience.service', () => ({ getAIExperienceBySlug: async () => null }));
vi.mock('@/features/search-experience/search-experience.service', () => ({ getSearchExperienceBySlug: async () => null }));
vi.mock('@/features/data-source/data-source.service', () => ({ getDataSourceBySlug: async () => null }));
vi.mock('@/features/search-index/search-index.service', () => ({
  getSearchIndexByName: async () => ({ id: 'i1' }),
  deleteSearchIndex: async () => undefined,
}));
vi.mock('@/shared/seeders/seed-registry.service', () => ({ deleteRegistryEntry: async () => undefined }));
vi.mock('@/features/search/providers', () => ({
  getSearchEngineProvider: () => ({
    deleteIndex: async () => ({ success: false, error: 'connect ECONNREFUSED 127.0.0.1:9200', cause: new Error('connect ECONNREFUSED 127.0.0.1:9200') }),
  }),
}));

import { resetDemo } from './demo.seeder';
import type { LoadedDemoManifest } from './demo-manifest';

describe('a demo reset whose index the search engine fails to delete', () => {
  it('warns with the engine error and does not count the index as deleted', async () => {
    const manifest = {
      demo: { key: 'demo' },
      chatExperience: { slug: 'chat' },
      searchExperience: { slug: 'search' },
      dataSource: { slug: 'source' },
      index: { name: 'shop', searchProvider: 'elasticsearch' },
    };

    const { deleted } = await resetDemo({ manifest } as unknown as LoadedDemoManifest);

    expect(deleted).toEqual(['search index shop (db)', 'seed-registry entry']);
    expect(reported(logs)).toEqual([
      expect.objectContaining({ level: 'warn', context: { error: 'connect ECONNREFUSED 127.0.0.1:9200' } }),
    ]);
  });
});
