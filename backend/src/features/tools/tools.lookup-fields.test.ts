// src/features/tools/tools.lookup-fields.test.ts

/**
 * A Find Record tool's name and code fields through the tools service: what create and edit
 * may store, what Generate tools pre-fills, and when the tool can be added to an experience.
 */

import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const repo = vi.hoisted(() => ({
  isSlugAvailable: vi.fn(async () => true),
  createTool: vi.fn(async (data: Record<string, unknown>) => ({ id: 't1', ...data })),
  getToolById: vi.fn(),
  updateTool: vi.fn(async (id: string, data: Record<string, unknown>) => ({ id, ...data })),
  getToolsByDataSourceId: vi.fn(async () => []),
}));
vi.mock('./tools.repository', () => repo);
const dataSources = vi.hoisted(() => ({ getDataSourceById: vi.fn() }));
vi.mock('@/features/data-source/data-source.repository', () => dataSources);
const indexFields = vi.hoisted(() => ({ getFieldsBySearchIndexId: vi.fn() }));
vi.mock('@/features/search-index/search-index-fields.repository', () => indexFields);
vi.mock('@/shared/utils/auth-utils', () => ({ getCurrentUserId: async () => 'admin' }));
vi.mock('./tools.executor', async (importOriginal) => ({ ...(await importOriginal<object>()), executeTool: vi.fn() }));
vi.mock('../ai-experience/ai-experience.cache', () => ({ aiExperienceCache: { clear: vi.fn() } }));
vi.mock('@/shared/cache/cache-manager', () => ({
  CacheManager: class {
    get = vi.fn(() => undefined);
    set = vi.fn();
    delete = vi.fn();
    deletePattern = vi.fn();
    clear = vi.fn();
  },
}));

import { handleGetLookupFields } from './tools.api.handlers';
import { createTool, createToolsForDataSource, notReadyToAssign, splitReadyToAssign, updateTool } from './tools.service';

const managedSource = { id: 'ds', type: 'search_index', config: { searchIndexId: 'idx' }, schema: null };
const externalSource = {
  id: 'ext',
  type: 'search_index_external',
  config: {},
  schema: {
    fields: [
      { name: 'title', type: 'text', isSearchable: true, isFilterable: false },
      { name: 'sku', type: 'keyword', isSearchable: false, isFilterable: true },
      { name: 'partNo', type: 'text', isSearchable: true, isFilterable: false },
    ],
  },
};
const indexDefinition = [
  { fieldName: 'name', fieldType: 'text', isSearchable: true, isFacetable: false },
  { fieldName: 'productId', fieldType: 'keyword', isSearchable: false, isFacetable: false, includeInResponse: true },
  { fieldName: 'internalCode', fieldType: 'keyword', isSearchable: false, isFacetable: false, includeInResponse: false },
  { fieldName: 'variants', fieldType: 'json', isSearchable: true, isFacetable: false },
];

const lookupInput = (dataSourceId: string, executorConfig: Record<string, unknown>) => ({
  name: 'Find', slug: 'find', executorType: 'data_source', operation: 'lookup', dataSourceId, executorConfig,
  aiDescription: 'Look up one item by its id, SKU or name.', timeout: 30_000, isSystem: false,
}) as never;

beforeEach(() => {
  vi.clearAllMocks();
  dataSources.getDataSourceById.mockImplementation(async (id: string) => (id === 'ext' ? externalSource : managedSource));
  indexFields.getFieldsBySearchIndexId.mockResolvedValue(indexDefinition);
});

describe('saving a Find Record tool', () => {
  it('keeps the name and code fields on create', async () => {
    await createTool(lookupInput('ds', { nameFields: ['name'], codeFields: ['variants.sku'] }));

    expect(repo.createTool).toHaveBeenCalledWith(expect.objectContaining({
      executorConfig: { nameFields: ['name'], codeFields: ['variants.sku'] },
    }));
  });

  it("refuses a field the index doesn't have, or an external code field it can't filter on", async () => {
    await expect(createTool(lookupInput('ds', { nameFields: ['title'] }))).rejects.toThrow("Invalid config: title isn't a field");
    await expect(createTool(lookupInput('ext', { codeFields: ['partNo'] }))).rejects.toThrow("can't be filtered on");
    await expect(createTool(lookupInput('ext', { codeFields: ['sku'], nameFields: ['title'] }))).resolves.toBeDefined();
  });

  it("refuses a config whose shape doesn't fit the operation", async () => {
    await expect(createTool(lookupInput('ds', { nameFields: 'name' }))).rejects.toThrow('Invalid config: nameFields');
  });

  it('checks the config shape of any data source tool on edit, not only Find Record', async () => {
    repo.getToolById.mockResolvedValue({
      id: 't2', executorType: 'data_source', operation: 'search', dataSourceId: 'ds', slug: 'search', executorConfig: {},
    });

    await expect(updateTool('t2', { executorConfig: { maxResults: 'ten' } } as never)).rejects.toThrow('Invalid config: maxResults');
    await expect(updateTool('t2', { executorConfig: { maxResults: 20 } } as never)).resolves.toBeDefined();
  });

  it("refuses a managed index field that is neither searched nor in responses, which can't ever match", async () => {
    await expect(createTool(lookupInput('ds', { codeFields: ['internalCode'] }))).rejects.toThrow("isn't searchable or shown in responses");
    await expect(createTool(lookupInput('ds', { codeFields: ['productId'] }))).resolves.toBeDefined();
  });

  it('checks only the fields an edit adds, so an unrelated save never fails on an older field', async () => {
    repo.getToolById.mockResolvedValue({
      id: 't1', executorType: 'data_source', operation: 'lookup', dataSourceId: 'ds', slug: 'find',
      executorConfig: { nameFields: ['gone'] },
    });

    await expect(updateTool('t1', { executorConfig: { nameFields: ['gone'] }, timeout: 20_000 } as never)).resolves.toBeDefined();
    await expect(updateTool('t1', { executorConfig: { nameFields: ['gone', 'nope'] } } as never)).rejects.toThrow('nope');
  });

  it('refuses name or code fields on a Find Record tool for uploaded files', async () => {
    dataSources.getDataSourceById.mockResolvedValue({ id: 'files', type: 'file_store', config: {}, schema: null });

    await expect(createTool(lookupInput('files', { nameFields: ['title'] }))).rejects.toThrow('only apply to Find Record on a search index');
  });

  it('asks for a health check when an external source has no fields yet', async () => {
    dataSources.getDataSourceById.mockResolvedValue({ ...externalSource, schema: null });

    await expect(createTool(lookupInput('ext', { codeFields: ['sku'] }))).rejects.toThrow('Run a health check');
  });
});

describe('Generate tools', () => {
  it('pre-fills Find Record with the fields the index suggests', async () => {
    await createToolsForDataSource('ds', 'Catalog', 'catalog', 'search_index', null);

    const lookup = repo.createTool.mock.calls.map(([data]) => data).find((d) => d.operation === 'lookup');
    expect(lookup?.executorConfig).toEqual(expect.objectContaining({ nameFields: ['name'] }));
    expect(lookup?.executorConfig).not.toHaveProperty('codeFields');
  });
});

describe('adding Find Record to an experience', () => {
  const find = (executorConfig: Record<string, unknown> | null, dataSourceId = 'ds') =>
    ({ name: 'Catalog Find Record', operation: 'lookup', dataSourceId, executorConfig }) as never;

  it('needs its name or code fields, or a hand-set idField', async () => {
    expect(await notReadyToAssign(find(null))).toContain("isn't set up");
    expect(await notReadyToAssign(find({ nameFields: [] }))).toContain("isn't set up");
    expect(await notReadyToAssign(find({ nameFields: ['name'] }))).toBeUndefined();
    expect(await notReadyToAssign(find({ idField: 'productId' }))).toBeUndefined();
  });

  it('leaves out only the tools that aren’t set up (the demo seeder)', async () => {
    const search = { ...(find(null) as object), name: 'Catalog Search', operation: 'search' } as never;
    const { ready, notReady } = await splitReadyToAssign([search, find(null), find({ codeFields: ['productId'] })]);

    expect(ready).toEqual([search, find({ codeFields: ['productId'] })]);
    expect(notReady).toEqual([expect.stringContaining('"Catalog Find Record" isn\'t set up')]);
  });

  it('is never held back for other tools or uploaded-file Find Record', async () => {
    dataSources.getDataSourceById.mockResolvedValue({ id: 'files', type: 'file_store', config: {}, schema: null });

    expect(await notReadyToAssign({ ...(find(null) as object), operation: 'search' } as never)).toBeUndefined();
    expect(await notReadyToAssign(find(null, 'files'))).toBeUndefined();
  });
});

describe("a Find Record tool's fields, as its pages read them (GET /api/tools/:id/lookup-fields)", () => {
  const get = async (tool: Record<string, unknown>) => {
    repo.getToolById.mockResolvedValue({ id: 't1', executorType: 'data_source', dataSourceId: 'ext', ...tool });
    const response = await handleGetLookupFields(new NextRequest('http://localhost/api/tools/t1/lookup-fields'), {
      params: Promise.resolve({ id: 't1' }),
    });
    const body = await response.json();
    return (body as { data: Record<string, unknown> | null }).data;
  };

  it('lists what can be chosen, what is chosen, what has gone and the suggestion', async () => {
    const status = await get({ operation: 'lookup', executorConfig: { nameFields: ['title'], codeFields: ['handle'] } });

    expect(status).toMatchObject({
      chosen: { nameFields: ['title'], codeFields: ['handle'] },
      configured: true,
      missing: ['handle'],
      suggested: { nameFields: ['title'], codeFields: ['sku'] },
    });
    expect((status?.candidates as Array<{ name: string }>).map((c) => c.name)).toEqual(['title', 'sku', 'partNo']);
  });

  it('is empty for tools that take no name or code fields', async () => {
    expect(await get({ operation: 'search', executorConfig: {} })).toBeNull();
  });

  it("warns about a chosen field the latest sample of a sampled index didn't show", async () => {
    const seen = { sampleSize: 25, nullRate: 0, distinctInSample: 25, profiledAt: '2026-10-26T10:00:00Z' };
    dataSources.getDataSourceById.mockResolvedValue({
      ...externalSource,
      schema: {
        discoveredFrom: 'sample',
        fields: [
          { name: 'title', type: 'text', isSearchable: true, profile: seen },
          { name: 'productName', type: 'text', isSearchable: true, profile: { ...seen, profiledAt: '2026-10-01T10:00:00Z' } },
        ],
      },
    });

    const status = await get({ operation: 'lookup', executorConfig: { nameFields: ['productName'] } });

    expect(status?.warnings).toEqual([expect.objectContaining({ field: 'productName', message: expect.stringContaining('latest sample') })]);
  });
});
