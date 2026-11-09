// src/features/search/providers/azure-ai-search/azure-engine.provider.create-delete.test.ts

/**
 * Creating or deleting an index Azure fails is passed on with its cause, not logged
 * here, as on Elasticsearch: the reindex, recreate, delete or upload it belongs to logs
 * it once, with its request id.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { reported, type LogLine } from '@/shared/test/log-recorder';

vi.mock('server-only', () => ({}));
const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
const azure = vi.hoisted(() => ({ error: undefined as unknown }));
vi.mock('./azure-client', () => ({
  getIndexClient: () => ({
    createIndex: async () => { throw azure.error; },
    deleteIndex: async () => { throw azure.error; },
  }),
  getSearchClient: () => ({ search: async () => { throw azure.error; } }),
  checkAzureHealth: vi.fn(),
}));

import { AzureEngineProvider } from './azure-engine.provider';

beforeEach(() => {
  logs.length = 0;
  azure.error = Object.assign(new Error('getaddrinfo ENOTFOUND shop.search.windows.net'), { name: 'RestError', code: 'ENOTFOUND' });
});

describe('an index Azure fails', () => {
  it('to create is passed on with its cause, not logged', async () => {
    const result = await new AzureEngineProvider().createIndex('shop', { mappings: { fields: [] } });
    expect(result).toEqual({ success: false, error: 'getaddrinfo ENOTFOUND shop.search.windows.net', cause: azure.error });
    expect(reported(logs)).toEqual([]);
  });

  it('to delete is passed on with its cause, not logged', async () => {
    const result = await new AzureEngineProvider().deleteIndex('shop');
    expect(result).toEqual({ success: false, error: 'getaddrinfo ENOTFOUND shop.search.windows.net', cause: azure.error });
    expect(reported(logs)).toEqual([]);
  });
});

describe('an index whose documents Azure fails to give a reindex', () => {
  it('is passed on with its cause, not logged', async () => {
    const result = await new AzureEngineProvider().fetchAllDocuments('shop');
    expect(result).toEqual({ success: false, documents: [], error: 'getaddrinfo ENOTFOUND shop.search.windows.net', cause: azure.error });
    expect(reported(logs)).toEqual([]);
  });
});
