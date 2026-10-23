import { beforeEach, describe, expect, it, vi } from 'vitest';

// An in-memory stand-in for everything the seeder touches: the seed registry,
// the search index and experience services, the indexer, the AI defaults and
// the advisory lock. Each test arranges `world`, runs the seeder, and checks
// what it did.

interface FakeIndex {
  id: string;
  name: string;
  description: string | null;
  searchType: 'lexical' | 'hybrid';
  aiModelId: number | null;
  searchProvider: string;
}

const world = vi.hoisted(() => ({
  locked: true,
  docs: [] as Array<{ slug: string; title: string; content: string }>,
  embedding: null as null | { providerId: string; modelId: number; modelKey: string; dimensions: number },
  registry: null as null | { checksum: string; metadata: Record<string, unknown> },
  index: null as null | FakeIndex,
  experience: null as null | { id: string; slug: string; description: string | null },
  /** Replaces the default indexDocuments result (all indexed, embedded when hybrid). */
  indexDocuments: null as null | ((n: number, hybrid: boolean) => unknown),
  adminError: null as null | Error,
  nextId: 1,
}));

const calls = vi.hoisted(() => ({
  createIndex: [] as Array<{ searchType: string; aiModelId?: number }>,
  deleteIndex: 0,
  createExperience: 0,
  deleteExperience: 0,
  recreateEmpty: 0,
  indexDocuments: 0,
  getAdmin: 0,
}));

const log = vi.hoisted(() => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }));
vi.mock('@/shared/logger/logger', () => ({ createLogger: () => log }));

vi.mock('@/db/index', () => ({
  db: {
    transaction: async (fn: (tx: unknown) => unknown) =>
      fn({ execute: async () => [{ locked: world.locked }] }),
  },
}));

vi.mock('./docs-source', () => ({
  readDocs: async () => world.docs,
  getAdminUserId: async () => {
    calls.getAdmin++;
    if (world.adminError) throw world.adminError;
    return 'admin';
  },
}));

vi.mock('@/features/ai-providers/ai-providers.service', () => ({
  getResolvedDefaults: async () => ({
    embedding: world.embedding
      ? { ...world.embedding }
      : { providerId: null, modelId: null, modelKey: null, dimensions: null },
  }),
}));

vi.mock('@/shared/seeders/seed-registry.service', () => ({
  calculateChecksum: (data: unknown) => JSON.stringify(data),
  getRegistryEntry: async () => world.registry,
  upsertRegistryEntry: async (_t: string, _k: string, checksum: string, metadata: Record<string, unknown>) => {
    world.registry = { checksum, metadata };
  },
}));

vi.mock('@/features/search-index/search-index.service', () => ({
  getSearchIndexByName: async () => world.index,
  createSearchIndex: async (input: { name: string; description: string; searchType: 'lexical' | 'hybrid'; aiModelId?: number }) => {
    calls.createIndex.push({ searchType: input.searchType, aiModelId: input.aiModelId });
    world.index = {
      id: `idx-${world.nextId++}`,
      name: input.name,
      description: input.description,
      searchType: input.searchType,
      aiModelId: input.aiModelId ?? null,
      searchProvider: 'elasticsearch',
    };
    return world.index;
  },
  deleteSearchIndex: async () => {
    calls.deleteIndex++;
    world.index = null;
  },
  recreateEmptyIndex: async () => {
    calls.recreateEmpty++;
    return { success: true };
  },
}));

vi.mock('@/features/search-index/search-index-fields.service', () => ({
  getFieldsBySearchIndexId: async () => [],
  updateField: async () => ({}),
  createFieldsFromMappingEntries: async () => ({ created: [], errors: [] }),
}));

vi.mock('@/features/search-experience/search-experience.service', () => ({
  getSearchExperienceBySlug: async () => {
    if (!world.experience) throw new Error('not found');
    return world.experience;
  },
  createSearchExperience: async (input: { slug: string; description: string }) => {
    calls.createExperience++;
    world.experience = { id: `exp-${world.nextId++}`, slug: input.slug, description: input.description };
    return world.experience;
  },
  deleteSearchExperience: async () => {
    calls.deleteExperience++;
    world.experience = null;
  },
}));

vi.mock('@/features/document-indexing/document-indexer.service', () => ({
  indexDocuments: async ({ documents }: { documents: unknown[] }) => {
    calls.indexDocuments++;
    const hybrid = world.index?.searchType === 'hybrid';
    if (world.indexDocuments) return world.indexDocuments(documents.length, hybrid);
    return {
      indexedDocuments: documents.length,
      failedDocuments: 0,
      errors: [],
      embeddingStats: { generated: hybrid ? documents.length : 0 },
    };
  },
}));

import { buildDocsSearchOnStartup, DocsSearchConflictError, getDocsSearchStatus, seedDocsSearch } from './docs-search.seeder';

const MODEL = { providerId: 'prov', modelId: 7, modelKey: 'embed-small', dimensions: 1536 };
const DOCS = [
  { slug: 'concepts/tools', title: 'Tools', content: '# Tools\nIntro.\n## Scaffolding\nHow tools are made.' },
  { slug: 'intro', title: 'Intro', content: '# Intro\nWelcome.' },
];

/** A failure the engine reports while indexing, e.g. vectors of the wrong size. */
const rejectAll = () => ({
  indexedDocuments: 0,
  failedDocuments: 3,
  errors: [{ error: 'mapper_parsing_exception: dense_vector has 1024 dims, expected 1536' }],
});

function resetCalls() {
  calls.createIndex = [];
  calls.deleteIndex = calls.createExperience = calls.deleteExperience = 0;
  calls.recreateEmpty = calls.indexDocuments = calls.getAdmin = 0;
}

beforeEach(() => {
  Object.assign(world, {
    locked: true,
    docs: DOCS,
    embedding: null,
    registry: null,
    index: null,
    experience: null,
    indexDocuments: null,
    adminError: null,
    nextId: 1,
  });
  resetCalls();
});

describe('seedDocsSearch', () => {
  it('builds a keyword-only index and experience when there is no embedding model', async () => {
    const summary = await seedDocsSearch();

    expect(summary).toEqual({ skipped: false, searchType: 'lexical', sections: 3 });
    expect(calls.createIndex).toEqual([{ searchType: 'lexical', aiModelId: undefined }]);
    expect(calls.createExperience).toBe(1);
    expect(world.registry?.metadata).toMatchObject({ searchType: 'lexical', sections: 3, hybridFailure: null });
  });

  it('skips when nothing changed', async () => {
    await seedDocsSearch();
    resetCalls();

    const summary = await seedDocsSearch();

    expect(summary).toMatchObject({ skipped: true, reason: 'unchanged' });
    expect(calls).toMatchObject({ deleteIndex: 0, deleteExperience: 0, recreateEmpty: 0, indexDocuments: 0 });
    expect(calls.createIndex).toEqual([]);
  });

  it('reloads the existing index in place when only the docs changed', async () => {
    await seedDocsSearch();
    const indexId = world.index?.id;
    resetCalls();
    world.docs = [...DOCS, { slug: 'guides/new', title: 'New', content: '# New\nFresh guide.' }];

    const summary = await seedDocsSearch();

    expect(summary).toMatchObject({ skipped: false, sections: 4 });
    expect(calls.recreateEmpty).toBe(1);
    expect(calls.indexDocuments).toBe(1);
    expect(calls).toMatchObject({ deleteIndex: 0, deleteExperience: 0, createExperience: 0 });
    expect(world.index?.id).toBe(indexId);
  });

  it('recreates the index and experience as hybrid once an embedding model exists', async () => {
    await seedDocsSearch();
    resetCalls();
    world.embedding = MODEL;

    const summary = await seedDocsSearch();

    expect(summary).toMatchObject({ skipped: false, searchType: 'hybrid' });
    expect(calls).toMatchObject({ deleteExperience: 1, deleteIndex: 1, createExperience: 1 });
    expect(calls.createIndex).toEqual([{ searchType: 'hybrid', aiModelId: 7 }]);
  });

  it('recreates when the stored schema version is older', async () => {
    await seedDocsSearch();
    world.registry!.metadata.schemaVersion = 0;
    world.docs = [...DOCS, { slug: 'x', title: 'X', content: '# X\nChanged.' }];
    resetCalls();

    await seedDocsSearch();

    expect(calls).toMatchObject({ deleteIndex: 1, recreateEmpty: 0 });
    expect(calls.createIndex).toHaveLength(1);
  });

  it('falls back to keyword-only when a hybrid build fails while indexing', async () => {
    world.embedding = MODEL;
    world.indexDocuments = (n, hybrid) => (hybrid ? rejectAll() : { indexedDocuments: n, failedDocuments: 0, errors: [] });

    const summary = await seedDocsSearch();

    expect(summary).toMatchObject({ skipped: false, searchType: 'lexical', sections: 3 });
    expect(calls.createIndex.map((c) => c.searchType)).toEqual(['hybrid', 'lexical']);
    expect(world.index?.searchType).toBe('lexical');
    expect(world.experience).not.toBeNull();
    const failure = world.registry?.metadata.hybridFailure as { model: string; error: string };
    expect(failure.model).toBe('embed-small:1536');
    expect(failure.error).toContain('dense_vector');
  });

  it('falls back to keyword-only when the embedding model returns no vectors', async () => {
    world.embedding = MODEL;
    world.indexDocuments = (n) => ({ indexedDocuments: n, failedDocuments: 0, errors: [], embeddingStats: { generated: 0 } });

    const summary = await seedDocsSearch();

    expect(summary).toMatchObject({ searchType: 'lexical' });
    expect(world.registry?.metadata.hybridFailure).toMatchObject({ error: 'the embedding model returned no vectors' });
  });

  describe('after a hybrid failure', () => {
    beforeEach(async () => {
      world.embedding = MODEL;
      world.indexDocuments = (n, hybrid) => (hybrid ? rejectAll() : { indexedDocuments: n, failedDocuments: 0, errors: [] });
      await seedDocsSearch();
      resetCalls();
    });

    it('does not try hybrid again with the same model', async () => {
      const summary = await seedDocsSearch();

      expect(summary).toMatchObject({ skipped: true, searchType: 'lexical' });
      expect(calls.indexDocuments).toBe(0);
      expect(calls.createIndex).toEqual([]);
    });

    it('keeps the failure when the docs change, and reloads keyword-only', async () => {
      world.docs = [...DOCS, { slug: 'y', title: 'Y', content: '# Y\nMore.' }];

      await seedDocsSearch();

      expect(calls.recreateEmpty).toBe(1);
      expect(calls.createIndex).toEqual([]);
      expect(world.registry?.metadata.hybridFailure).toMatchObject({ model: 'embed-small:1536' });
    });

    it('tries hybrid again when forced (Rebuild)', async () => {
      world.indexDocuments = null;

      const summary = await seedDocsSearch({ force: true });

      expect(summary).toMatchObject({ searchType: 'hybrid' });
      expect(world.registry?.metadata.hybridFailure).toBeNull();
    });

    it('tries hybrid again with a different model or size', async () => {
      world.indexDocuments = null;
      world.embedding = { ...MODEL, dimensions: 1024 };

      const summary = await seedDocsSearch();

      expect(summary).toMatchObject({ searchType: 'hybrid' });
    });

    it('tries hybrid again after a day', async () => {
      world.indexDocuments = null;
      (world.registry!.metadata.hybridFailure as { at: string }).at = new Date(Date.now() - 25 * 3600_000).toISOString();

      const summary = await seedDocsSearch();

      expect(summary).toMatchObject({ searchType: 'hybrid' });
    });

    it('reports why search is keyword-only', async () => {
      const status = await getDocsSearchStatus();

      expect(status).toMatchObject({ searchType: 'lexical', conflict: null });
      expect(status.hybridFailure).toMatchObject({ model: 'embed-small:1536' });
    });
  });

  it('does not fall back when the search engine is unreachable — the caller retries', async () => {
    world.embedding = MODEL;
    world.indexDocuments = () => {
      throw Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:9200'), { name: 'ConnectionError' });
    };

    await expect(seedDocsSearch()).rejects.toThrow('ECONNREFUSED');
    expect(calls.createIndex.map((c) => c.searchType)).toEqual(['hybrid']);
    expect(world.registry).toBeNull();
  });

  it("never touches an index or experience with our name that it didn't create", async () => {
    world.index = {
      id: 'theirs',
      name: 'interakt-docs',
      description: 'Our team docs',
      searchType: 'lexical',
      aiModelId: null,
      searchProvider: 'elasticsearch',
    };

    await expect(seedDocsSearch()).rejects.toBeInstanceOf(DocsSearchConflictError);
    expect(calls).toMatchObject({ deleteIndex: 0, deleteExperience: 0, recreateEmpty: 0, indexDocuments: 0 });
    expect(world.index?.id).toBe('theirs');
    expect((await getDocsSearchStatus()).conflict).toContain('search index "interakt-docs"');
  });

  it('adopts its own index when the registry entry is missing', async () => {
    await seedDocsSearch();
    world.registry = null;
    resetCalls();

    await expect(seedDocsSearch()).resolves.toMatchObject({ skipped: false });
    expect(calls.deleteIndex).toBe(1);
  });

  it('skips when another instance holds the lock', async () => {
    world.locked = false;

    const summary = await seedDocsSearch();

    expect(summary).toMatchObject({ skipped: true, reason: 'another instance is building it' });
    expect(calls.getAdmin).toBe(0);
  });
});

describe('buildDocsSearchOnStartup', () => {
  it('retries errors that look transient', async () => {
    world.adminError = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), { code: 'ECONNREFUSED' });

    await buildDocsSearchOnStartup(0);

    expect(calls.getAdmin).toBe(3);
  });

  it('does not retry other errors', async () => {
    world.adminError = new Error('No admin user found.');

    await buildDocsSearchOnStartup(0);

    expect(calls.getAdmin).toBe(1);
  });

  it('never throws', async () => {
    world.adminError = new Error('boom');
    await expect(buildDocsSearchOnStartup(0)).resolves.toBeUndefined();
  });
});
