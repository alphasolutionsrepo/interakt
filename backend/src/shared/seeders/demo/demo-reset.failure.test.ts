// src/shared/seeders/demo/demo-reset.failure.test.ts

/**
 * Resetting the demo removes the index record (deleteSearchIndex drops the engine's
 * index first) and then the engine's index. The engine passes a failed call on instead
 * of logging it, so the reset reports it: logged with the error itself, listed as
 * failed, not counted as deleted. When the record can't be removed (the search service
 * is down), that is an error, and the registry entry stays so the demo can be reset
 * again.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { reported, type LogLine } from '@/shared/test/log-recorder';

vi.mock('server-only', () => ({}));
const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
vi.mock('@/db/index', () => ({ db: {} }));
vi.mock('@/features/ai-experience/ai-experience.service', () => ({ getAIExperienceBySlug: async () => null }));
vi.mock('@/features/search-experience/search-experience.service', () => ({ getSearchExperienceBySlug: async () => null }));
vi.mock('@/features/data-source/data-source.service', () => ({ getDataSourceBySlug: async () => null }));
vi.mock('@/features/search-experience', () => ({ invalidateSearchExperienceCacheBySearchIndex: async () => undefined }));
vi.mock('@/features/document-indexing/document-indexer.service', () => ({}));
vi.mock('@/features/search-index/search-index.cache', () => ({
  cache: { getOrSet: (_key: string, load: () => unknown) => load(), clear: async () => undefined },
  clearIndexCache: async () => undefined,
  SEARCH_INDEX_CACHE_TTL: 0,
}));
// The real deleteSearchIndex runs over these: the index record, and the engine below
const repository = vi.hoisted(() => ({
  getSearchIndexByName: vi.fn(async () => ({ id: 'i1', name: 'shop', searchProvider: 'elasticsearch' })),
  getSearchIndexById: vi.fn(async () => ({ id: 'i1', name: 'shop', searchProvider: 'elasticsearch' })),
  findSearchIndexReferences: vi.fn(async () => []),
  deleteSearchIndex: vi.fn(async () => undefined),
}));
vi.mock('@/features/search-index/search-index.repository', () => repository);
const registry = vi.hoisted(() => ({ deleteRegistryEntry: vi.fn(async () => undefined) }));
vi.mock('@/shared/seeders/seed-registry.service', () => registry);
const engine = vi.hoisted(() => ({ indexExists: vi.fn(), deleteIndex: vi.fn() }));
vi.mock('@/features/search/providers', () => ({ getSearchEngineProvider: () => engine }));

import { resetDemo } from './demo.seeder';
import type { LoadedDemoManifest } from './demo-manifest';

const manifest = {
  demo: { key: 'demo' },
  chatExperience: { slug: 'chat' },
  searchExperience: { slug: 'search' },
  dataSource: { slug: 'source' },
  index: { name: 'shop', searchProvider: 'elasticsearch' },
};
const reset = () => resetDemo({ manifest } as unknown as LoadedDemoManifest);

beforeEach(() => {
  logs.length = 0;
  vi.clearAllMocks();
});

describe('a demo reset whose index the search engine fails to delete', () => {
  it('warns with the engine error and does not count the index as deleted', async () => {
    const down = new Error('connect ECONNREFUSED 127.0.0.1:9200');
    engine.indexExists.mockResolvedValue(false);
    engine.deleteIndex.mockResolvedValue({ success: false, error: down.message, cause: down });

    const { deleted, failed } = await reset();

    expect(deleted).toEqual(['search index shop (db)', 'seed-registry entry']);
    expect(failed).toEqual(['elasticsearch index shop']);
    expect(reported(logs)).toEqual([
      expect.objectContaining({ level: 'warn', context: { err: expect.objectContaining({ message: down.message, cause: down }) } }),
    ]);
  });
});

describe('a demo reset while the search service is down', () => {
  it('logs the index failure as an error with the error itself, says the reset is incomplete and keeps the demo registered', async () => {
    const down = new Error('connect ECONNREFUSED 127.0.0.1:9200');
    engine.indexExists.mockRejectedValue(down);

    const { deleted, failed } = await reset();

    expect(deleted).toEqual([]);
    expect(failed).toEqual(['search index shop (db)']);
    expect(repository.deleteSearchIndex).not.toHaveBeenCalled();
    expect(engine.deleteIndex).not.toHaveBeenCalled();
    expect(registry.deleteRegistryEntry).not.toHaveBeenCalled();
    expect(reported(logs)).toEqual([
      expect.objectContaining({ level: 'error', message: 'Could not delete search index shop (db)', context: { err: down } }),
    ]);
  });
});
