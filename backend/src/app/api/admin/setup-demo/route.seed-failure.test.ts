// src/app/api/admin/setup-demo/route.seed-failure.test.ts

/**
 * Demo setup with the search service down: the products can't be indexed, so the setup
 * fails there instead of finishing with "0 indexed". The answer (the JSON response, or
 * the stream's error event) logs it once, as an error caused by the search service's
 * error, and nothing after the products step runs. A write that fails part way (some
 * products indexed) fails the setup the same way; a few products the search service
 * rejects only warn, and the setup finishes. Runs the real seeder and indexer, with the
 * engine failing the way Elasticsearch does. A reset that can't remove everything says
 * what was left in its answer.
 */

import { errors } from '@elastic/elasticsearch';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NotFoundError } from '@/shared/errors/app-error';
import { deleteRegistryEntry, upsertRegistryEntry } from '@/shared/seeders/seed-registry.service';
import { reported, type LogLine } from '@/shared/test/log-recorder';

const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
vi.mock('@/shared/utils/auth-utils', () => ({ getCurrentUser: async () => ({ id: 'admin', role: 'admin' }) }));

const INDEX = { id: 'i1', name: 'shop', searchType: 'keyword', searchProvider: 'elasticsearch' };
vi.mock('@/shared/seeders/demo/demo-manifest', () => ({
  loadDemoManifest: async () => ({
    manifest: {
      demo: { key: 'demo', name: 'Demo' },
      provider: {
        recommended: 'ollama',
        options: { ollama: { key: 'ollama', label: 'Ollama', authType: 'none', requiredModels: [], defaults: { chatModel: 'chat', embeddingModel: 'embed' } } },
      },
      index: { name: 'shop', searchType: 'keyword', searchProvider: 'elasticsearch', documentsFile: 'products.json' },
      dataSource: { slug: 'source', name: 'Source' },
      tools: {},
      searchExperience: { slug: 'search' },
      chatExperience: { slug: 'chat' },
      warmup: { enabled: false },
    },
    mapping: { fields: [] },
    documents: products,
  }),
}));
const products = vi.hoisted(() => [] as Record<string, unknown>[]);
vi.mock('@/shared/seeders/demo/demo-warmup', () => ({ runWarmup: vi.fn() }));
vi.mock('@/shared/seeders/seed-registry.service', () => ({
  calculateChecksum: () => 'sum',
  getRegistryEntry: async () => null,
  upsertRegistryEntry: vi.fn(),
  deleteRegistryEntry: vi.fn(),
}));

// Database: the admin, the index record and the indexing batch
vi.mock('@/db/index', () => {
  const chain = (rows: unknown[]) => ({ from: () => ({ where: () => ({ limit: async () => rows }) }) });
  return {
    db: {
      query: { user: { findFirst: async () => ({ id: 'admin', email: 'admin@example.com' }) } },
      select: () => chain([INDEX]),
      insert: () => ({ values: () => ({ returning: async () => [{ id: 'b1' }] }) }),
      update: () => ({ set: () => ({ where: async () => undefined }) }),
    },
  };
});
vi.mock('@/features/ai-providers/ai-providers.service', () => ({
  getProviderByKey: async () => ({ id: 'ollama-id' }),
  updateProvider: vi.fn(),
  updateModel: vi.fn(),
  createModel: vi.fn(),
  formatModelDisplayName: (key: string) => key,
  updateSystemDefaults: vi.fn(),
}));
vi.mock('@/features/ai-providers/ai-providers.repository', () => ({
  getModelByProviderAndKey: async () => ({ id: 1, isAvailable: true, dimensions: null }),
}));
vi.mock('@/features/ai-service', () => ({ generateEmbeddings: vi.fn() }));
vi.mock('@/features/search-index/search-index.service', () => ({
  getSearchIndexByName: async () => INDEX,
  createSearchIndex: vi.fn(),
  deleteSearchIndex: vi.fn(),
}));
// The products' title, the one field the indexer writes
const fields = vi.hoisted(() => [] as unknown[]);
vi.mock('@/features/search-index/search-index-fields.service', () => ({
  getFieldsBySearchIndexId: async () => fields,
  createFieldsFromMappingEntries: async () => ({ created: [], errors: [] }),
  updateFieldMappingConfig: vi.fn(),
  updateField: vi.fn(),
}));
vi.mock('@/features/search-index/search-index-fields.repository', () => ({ getVectorSourceFields: async () => [] }));
// The steps after the products: the data source, its tools and the experiences
const later = vi.hoisted(() => ({
  getDataSourceBySlug: vi.fn(), createDataSource: vi.fn(), deleteDataSource: vi.fn(),
  getToolsByDataSourceId: vi.fn(), splitReadyToAssign: vi.fn(),
  getSearchExperienceBySlug: vi.fn(), getAIExperienceBySlug: vi.fn(),
}));
vi.mock('@/features/data-source/data-source.service', () => ({
  getDataSourceBySlug: later.getDataSourceBySlug, createDataSource: later.createDataSource, deleteDataSource: later.deleteDataSource,
  performHealthCheck: vi.fn(),
}));
vi.mock('@/features/tools/tools.service', () => ({
  createToolsForDataSource: vi.fn(), getToolsByDataSourceId: later.getToolsByDataSourceId, splitReadyToAssign: later.splitReadyToAssign,
  updateTool: vi.fn(), deleteTool: vi.fn(),
}));
vi.mock('@/features/search-experience/search-experience.service', () => ({
  createSearchExperience: vi.fn(), getSearchExperienceBySlug: later.getSearchExperienceBySlug, deleteSearchExperience: vi.fn(),
}));
vi.mock('@/features/ai-experience/ai-experience.service', () => ({
  createAIExperience: vi.fn(), getAIExperienceBySlug: later.getAIExperienceBySlug, deleteAIExperience: vi.fn(),
}));

// The search engine: down by default, failing the way the Elasticsearch client does
// when the service can't be reached
const down = vi.hoisted(() => ({ error: undefined as unknown }));
const engine = vi.hoisted(() => ({ indexExists: vi.fn(), bulkIndex: vi.fn(), getIndexStats: vi.fn(), deleteIndex: vi.fn() }));
vi.mock('@/features/search/providers', () => ({ getSearchEngineProvider: () => engine }));

import { POST } from './route';

const seed = (body: Record<string, unknown> = {}) => POST(new NextRequest('http://localhost/api/admin/setup-demo', {
  method: 'POST',
  body: JSON.stringify({ action: 'seed', warmup: false, ...body }),
}));

const meta = { body: null, statusCode: 0, headers: {}, meta: {}, warnings: null } as never;

beforeEach(() => {
  logs.length = 0;
  vi.clearAllMocks();
  for (const mock of [...Object.values(later), ...Object.values(engine)]) mock.mockReset();
  products.splice(0, products.length, { id: 'p1', title: 'Linen shirt' });
  fields.length = 0;
  down.error = new errors.ConnectionError('connect ECONNREFUSED 127.0.0.1:9200', meta);
  engine.indexExists.mockImplementation(async () => { throw down.error; });
});

/** The search service is up and takes the first product, the second fails as given */
const secondProductFails = (failure: { error: string; writeError?: unknown }) => {
  products.push({ id: 'p2', title: 'Wool coat' });
  fields.push({ id: 'f1', fieldName: 'title', fieldType: 'text', sourceFieldName: 'title', transformConfig: { mode: 'source' } });
  engine.indexExists.mockResolvedValue(true);
  engine.getIndexStats.mockResolvedValue(null);
  engine.bulkIndex.mockResolvedValue({
    success: false,
    indexed: 1,
    failed: 1,
    errors: [{ index: 1, id: 'p2', error: failure.error }],
    ...(failure.writeError !== undefined && { writeError: failure.writeError }),
  });
};

const loggedOnce = () => {
  expect(reported(logs)).toEqual([expect.objectContaining({ level: 'error' })]);
  const err = reported(logs)[0].context.err as Error;
  expect(err.message).toBe("None of the 1 documents from products.json were indexed: Elasticsearch couldn't be reached.");
  expect(err.cause).toBe(down.error);
  expect(logs.find((line) => line.message.includes('Demo seed complete'))).toBeUndefined();
  expect(later.getDataSourceBySlug).not.toHaveBeenCalled();
};

describe('demo setup when the search service is down', () => {
  it('answers a failure with what happened and what to do, logged once', async () => {
    const res = await seed();
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toMatchObject({
      code: 'INDEXING_FAILED',
      message: "None of the 1 documents from products.json were indexed: Elasticsearch couldn't be reached.",
      hint: expect.stringContaining('Check that the service is running'),
    });
    loggedOnce();
  });

  it('ends the progress stream with an error event, logged once', async () => {
    const res = await seed({ stream: true });
    const text = await res.text();

    expect(text).toContain('"type":"error"');
    expect(text).toContain("None of the 1 documents from products.json were indexed: Elasticsearch couldn't be reached.");
    expect(text).not.toContain('"type":"complete"');
    loggedOnce();
  });
});

describe('demo setup when some products fail to index', () => {
  it('fails when a write failed part way, with the write error as the cause', async () => {
    const timedOut = new errors.TimeoutError('Request timed out', meta);
    secondProductFails({ error: 'Request timed out', writeError: timedOut });

    const res = await seed();
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toMatchObject({
      code: 'INDEXING_FAILED',
      message: "1 of 2 documents indexed from products.json, 1 failed: Elasticsearch didn't respond in time.",
    });
    expect(reported(logs)).toEqual([expect.objectContaining({ level: 'error' })]);
    expect((reported(logs)[0].context.err as Error).cause).toBe(timedOut);
    expect(logs.find((line) => line.message.includes('Demo seed complete'))).toBeUndefined();
    expect(later.getDataSourceBySlug).not.toHaveBeenCalled();
    expect(upsertRegistryEntry).not.toHaveBeenCalled();
  });

  it('warns about the rejected products and finishes the setup', async () => {
    secondProductFails({ error: 'mapper_parsing_exception: failed to parse field [price]' });
    later.getDataSourceBySlug.mockResolvedValue({ id: 'ds1' });
    later.getToolsByDataSourceId.mockResolvedValue([{ id: 't1', slug: 'search', operation: 'search' }]);
    later.splitReadyToAssign.mockResolvedValue({ ready: [], notReady: [] });
    later.getSearchExperienceBySlug.mockResolvedValue({ slug: 'search', accessToken: 'st' });
    later.getAIExperienceBySlug.mockResolvedValue({ slug: 'chat', accessToken: 'ct' });

    const res = await seed();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toMatchObject({ action: 'seed', skipped: false, index: { name: 'shop', documents: 1 } });
    expect(reported(logs)).toEqual([
      expect.objectContaining({ level: 'warn', message: 'Some documents failed to index', context: expect.objectContaining({ failed: 1 }) }),
    ]);
    expect(upsertRegistryEntry).toHaveBeenCalled();
    expect(logs.find((line) => line.message.includes('Demo seed complete'))).toBeDefined();
  });
});

describe('a demo reset that cannot remove everything', () => {
  it('answers with what was left and keeps the demo registered', async () => {
    later.getAIExperienceBySlug.mockResolvedValue(null);
    later.getSearchExperienceBySlug.mockRejectedValue(new NotFoundError('Search experience not found'));
    later.getDataSourceBySlug.mockResolvedValue({ id: 'ds1' });
    later.getToolsByDataSourceId.mockResolvedValue([]);
    later.deleteDataSource.mockRejectedValue(new Error('still referenced'));
    engine.deleteIndex.mockResolvedValue({ success: true });

    const res = await POST(new NextRequest('http://localhost/api/admin/setup-demo', {
      method: 'POST',
      body: JSON.stringify({ action: 'reset' }),
    }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual({
      action: 'reset',
      deleted: ['search index shop (db)', 'Elasticsearch index shop'],
      failed: ['data source source'],
    });
    expect(deleteRegistryEntry).not.toHaveBeenCalled();
  });
});
