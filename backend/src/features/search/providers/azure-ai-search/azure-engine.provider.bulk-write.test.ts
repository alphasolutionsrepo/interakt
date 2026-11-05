// src/features/search/providers/azure-ai-search/azure-engine.provider.bulk-write.test.ts

/**
 * A bulk write Azure fails as a whole (it couldn't be reached) fails every document with
 * the same text and keeps the error itself, as on Elasticsearch, so an upload, reindex
 * or document write can explain it. That caller logs it, with its request id.
 */

import { describe, expect, it, vi } from 'vitest';

import { reported, type LogLine } from '@/shared/test/log-recorder';

vi.mock('server-only', () => ({}));
const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
const azure = vi.hoisted(() => ({ error: undefined as unknown, failFromCall: 1, calls: 0 }));
vi.mock('./azure-client', () => ({
  getIndexClient: vi.fn(),
  getSearchClient: () => ({
    uploadDocuments: async (batch: Array<{ id: string }>) => {
      if (++azure.calls >= azure.failFromCall) throw azure.error;
      return { results: batch.map((d) => ({ key: d.id, succeeded: true, statusCode: 201 })) };
    },
  }),
  checkAzureHealth: vi.fn(),
}));

import { AzureEngineProvider } from './azure-engine.provider';

describe('an Azure bulk write that fails as a whole', () => {
  it('keeps the error, fails every document with its text, and leaves logging it to the caller', async () => {
    const down = Object.assign(new Error('getaddrinfo ENOTFOUND shop.search.windows.net'), { name: 'RestError', code: 'ENOTFOUND' });
    azure.error = down;
    azure.calls = 0;
    azure.failFromCall = 1;

    const result = await new AzureEngineProvider().bulkIndex('shop', [{ _id: 'a', title: 'Linen' }, { _id: 'b', title: 'Wool' }]);

    expect(result).toMatchObject({ success: false, indexed: 0, failed: 2, writeError: down });
    expect(result.errors[0].error).toMatch(/ENOTFOUND/);
    expect(reported(logs)).toEqual([]);
  });
});

describe('an Azure bulk write that fails as a whole with an error that has no message', () => {
  it('still gives each document a reason', async () => {
    azure.error = Object.assign(new Error(''), { name: 'RestError' });
    azure.calls = 0;
    azure.failFromCall = 1;

    const result = await new AzureEngineProvider().bulkIndex('shop', [{ _id: 'a', title: 'Linen' }]);

    expect(result.errors).toEqual([{ index: 0, error: 'RestError' }]);
  });
});

describe('an Azure bulk write where a later batch fails as a whole', () => {
  it('still counts the batches already written, so a reindex is partial, not failed', async () => {
    const timedOut = Object.assign(new Error('Request timed out'), { name: 'RestError' });
    azure.error = timedOut;
    azure.calls = 0;
    azure.failFromCall = 2;
    const documents = Array.from({ length: 1001 }, (_, i) => ({ _id: `d${i}`, title: 'Linen' }));

    const result = await new AzureEngineProvider().bulkIndex('shop', documents);

    expect(result).toMatchObject({ success: false, indexed: 1000, failed: 1, writeError: timedOut });
    expect(result.errors).toEqual([{ index: 1000, error: 'Request timed out' }]);
  });
});
