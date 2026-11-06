// src/shared/seeders/demo/demo-reset.failure.test.ts

/**
 * Resetting the demo removes the experiences, the data source and its tools, the index
 * record (deleteSearchIndex drops the engine's index first) and then the engine's index.
 * Whatever can't be removed, or looked up to be removed, is listed as failed and logged
 * with the error itself, and the registry entry stays so the demo still shows as set up
 * and can be reset again. When the record can't be removed (the search service is down),
 * that is an error and the engine's index is left alone. Once the record is gone, a
 * reset deletes the engine's index by name, so a reset that failed there can be re-run.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { reported, type LogLine } from '@/shared/test/log-recorder';

vi.mock('server-only', () => ({}));
const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
vi.mock('@/db/index', () => ({ db: {} }));
// The demo's other records, found and deleted by slug
const records = vi.hoisted(() => ({
  getAIExperienceBySlug: vi.fn(),
  deleteAIExperience: vi.fn(),
  getSearchExperienceBySlug: vi.fn(),
  deleteSearchExperience: vi.fn(),
  getDataSourceBySlug: vi.fn(),
  deleteDataSource: vi.fn(),
  getToolsByDataSourceId: vi.fn(),
  deleteTool: vi.fn(),
}));
vi.mock('@/features/ai-experience/ai-experience.service', () => ({
  getAIExperienceBySlug: records.getAIExperienceBySlug, deleteAIExperience: records.deleteAIExperience,
}));
vi.mock('@/features/search-experience/search-experience.service', () => ({
  getSearchExperienceBySlug: records.getSearchExperienceBySlug, deleteSearchExperience: records.deleteSearchExperience,
  // The service's own, not the shared app error
  NotFoundError: class NotFoundError extends Error {},
}));
vi.mock('@/features/data-source/data-source.service', () => ({
  getDataSourceBySlug: records.getDataSourceBySlug, deleteDataSource: records.deleteDataSource,
}));
vi.mock('@/features/tools/tools.service', () => ({
  getToolsByDataSourceId: records.getToolsByDataSourceId, deleteTool: records.deleteTool,
}));
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
const registry = vi.hoisted(() => ({ deleteRegistryEntry: vi.fn(async () => undefined), upsertRegistryEntry: vi.fn(async () => undefined) }));
vi.mock('@/shared/seeders/seed-registry.service', () => registry);
const engine = vi.hoisted(() => ({ indexExists: vi.fn(), deleteIndex: vi.fn() }));
vi.mock('@/features/search/providers', () => ({ getSearchEngineProvider: () => engine }));

import { NotFoundError } from '@/features/search-experience/search-experience.service';

import { resetDemo } from './demo.seeder';
import type { LoadedDemoManifest } from './demo-manifest';

const manifest = {
  demo: { key: 'demo' },
  chatExperience: { slug: 'chat' },
  searchExperience: { slug: 'search' },
  dataSource: { slug: 'source' },
  index: { name: 'shop', searchProvider: 'elasticsearch' },
};
const reset = (searchProvider = 'elasticsearch') =>
  resetDemo({ manifest: { ...manifest, index: { ...manifest.index, searchProvider } } } as unknown as LoadedDemoManifest);

const INDEX = { id: 'i1', name: 'shop', searchProvider: 'elasticsearch' };

/** A demo with every record in place, each removed without trouble */
const allInPlace = () => {
  records.getAIExperienceBySlug.mockResolvedValue({ id: 'c1' });
  records.getSearchExperienceBySlug.mockResolvedValue({ id: 's1' });
  records.getDataSourceBySlug.mockResolvedValue({ id: 'd1' });
  records.getToolsByDataSourceId.mockResolvedValue([{ id: 't1', slug: 'search-tool' }]);
};

beforeEach(() => {
  logs.length = 0;
  vi.clearAllMocks();
  // Nothing but the index by default: the getters answer none (the search experience's throws its service's NotFoundError)
  records.getAIExperienceBySlug.mockResolvedValue(null);
  records.getSearchExperienceBySlug.mockRejectedValue(new NotFoundError('Search experience', 'search'));
  records.getDataSourceBySlug.mockResolvedValue(null);
  records.getToolsByDataSourceId.mockResolvedValue([]);
  for (const remove of [records.deleteAIExperience, records.deleteSearchExperience, records.deleteDataSource, records.deleteTool]) {
    remove.mockResolvedValue(undefined);
  }
  repository.getSearchIndexByName.mockResolvedValue(INDEX);
  repository.getSearchIndexById.mockResolvedValue(INDEX);
  engine.indexExists.mockResolvedValue(false);
  engine.deleteIndex.mockResolvedValue({ success: true });
});

describe('a demo reset whose index the search engine fails to delete', () => {
  it('warns with the engine error, does not count the index as deleted and keeps the demo registered', async () => {
    const down = new Error('connect ECONNREFUSED 127.0.0.1:9200');
    engine.deleteIndex.mockResolvedValue({ success: false, error: down.message, cause: down });

    const { deleted, failed } = await reset();

    expect(deleted).toEqual(['search index shop (db)']);
    expect(failed).toEqual(['Elasticsearch index shop']);
    expect(registry.deleteRegistryEntry).not.toHaveBeenCalled();
    expect(reported(logs)).toEqual([
      expect.objectContaining({ level: 'warn', context: { err: expect.objectContaining({ message: down.message, cause: down }) } }),
    ]);
  });

  it('names the search service the demo is on', async () => {
    engine.deleteIndex.mockResolvedValue({ success: false, error: 'Service unavailable' });

    const { failed } = await reset('azure-ai-search');

    expect(failed).toEqual(['Azure AI Search index shop']);
  });

  it('deletes the index by name when reset again, after its record is gone, and then unregisters the demo', async () => {
    repository.getSearchIndexByName.mockResolvedValue(null as never);

    const { deleted, failed } = await reset();

    expect(failed).toEqual([]);
    expect(engine.deleteIndex).toHaveBeenCalledWith('shop');
    expect(deleted).toEqual(['Elasticsearch index shop', 'seed-registry entry']);
    expect(registry.deleteRegistryEntry).toHaveBeenCalled();
  });
});

describe('a demo reset after a setup that never created its search experience', () => {
  it("takes the missing search experience as nothing to delete and unregisters the demo", async () => {
    const { failed } = await reset();

    expect(failed).toEqual([]);
    expect(registry.deleteRegistryEntry).toHaveBeenCalled();
    expect(registry.upsertRegistryEntry).not.toHaveBeenCalled();
  });
});

describe('a demo reset that leaves something behind', () => {
  it('keeps the demo registered as incomplete, so setting it up again re-runs instead of skipping', async () => {
    allInPlace();
    records.deleteDataSource.mockRejectedValue(new Error('data source in use'));

    await reset();

    expect(registry.deleteRegistryEntry).not.toHaveBeenCalled();
    expect(registry.upsertRegistryEntry).toHaveBeenCalledWith('demo', 'demo', 'incomplete', expect.objectContaining({ incomplete: true, failed: ['data source source'] }));
  });
});

describe('a demo reset where an earlier step fails', () => {
  it('removes everything and unregisters the demo when nothing fails', async () => {
    allInPlace();

    const { deleted, failed } = await reset();

    expect(failed).toEqual([]);
    expect(deleted).toEqual([
      'chat experience chat',
      'search experience search',
      'tool search-tool',
      'data source source',
      'search index shop (db)',
      'Elasticsearch index shop',
      'seed-registry entry',
    ]);
    expect(reported(logs)).toEqual([]);
  });

  it.each([
    ['chat experience chat', records.deleteAIExperience],
    ['search experience search', records.deleteSearchExperience],
    ['tool search-tool', records.deleteTool],
    ['data source source', records.deleteDataSource],
  ])('lists %s as failed, removes the rest and keeps the demo registered', async (label, remove) => {
    allInPlace();
    const err = new Error('still referenced');
    remove.mockRejectedValue(err);

    const { deleted, failed } = await reset();

    expect(failed).toEqual([label]);
    expect(deleted).not.toContain(label);
    expect(deleted).toEqual(expect.arrayContaining(['search index shop (db)', 'Elasticsearch index shop']));
    expect(deleted).not.toContain('seed-registry entry');
    expect(registry.deleteRegistryEntry).not.toHaveBeenCalled();
    expect(reported(logs)).toEqual([
      expect.objectContaining({ level: 'warn', message: `Could not delete ${label} (non-fatal)`, context: { err } }),
    ]);
  });
});

describe('a demo reset that cannot look up what to delete', () => {
  it.each([
    ['chat experience chat', records.getAIExperienceBySlug],
    ['search experience search', records.getSearchExperienceBySlug],
    ['data source source', records.getDataSourceBySlug],
    ['tools of data source source', records.getToolsByDataSourceId],
  ])('lists %s as failed, logged with the error, and keeps the demo registered', async (label, lookup) => {
    allInPlace();
    const err = new Error('connection terminated');
    lookup.mockRejectedValue(err);

    const { deleted, failed } = await reset();

    expect(failed).toEqual([label]);
    expect(deleted).toEqual(expect.arrayContaining(['search index shop (db)', 'Elasticsearch index shop']));
    expect(registry.deleteRegistryEntry).not.toHaveBeenCalled();
    expect(reported(logs)).toEqual([
      expect.objectContaining({ level: 'warn', message: `Could not look up ${label} (non-fatal)`, context: { err } }),
    ]);
  });

  it('lists the index as failed, logged as an error, and leaves the engine index alone', async () => {
    const err = new Error('connection terminated');
    repository.getSearchIndexByName.mockRejectedValue(err);

    const { deleted, failed } = await reset();

    expect(failed).toEqual(['search index shop (db)']);
    expect(deleted).toEqual([]);
    expect(engine.deleteIndex).not.toHaveBeenCalled();
    expect(registry.deleteRegistryEntry).not.toHaveBeenCalled();
    expect(reported(logs)).toEqual([
      expect.objectContaining({ level: 'error', message: 'Could not look up search index shop (db)', context: { err } }),
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
