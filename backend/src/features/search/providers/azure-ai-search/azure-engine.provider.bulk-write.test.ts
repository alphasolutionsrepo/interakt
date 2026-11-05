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
const azure = vi.hoisted(() => ({ error: undefined as unknown }));
vi.mock('./azure-client', () => ({
  getIndexClient: vi.fn(),
  getSearchClient: () => ({ uploadDocuments: async () => { throw azure.error; } }),
  checkAzureHealth: vi.fn(),
}));

import { AzureEngineProvider } from './azure-engine.provider';

describe('an Azure bulk write that fails as a whole', () => {
  it('keeps the error, fails every document with its text, and leaves logging it to the caller', async () => {
    const down = Object.assign(new Error('getaddrinfo ENOTFOUND shop.search.windows.net'), { name: 'RestError', code: 'ENOTFOUND' });
    azure.error = down;

    const result = await new AzureEngineProvider().bulkIndex('shop', [{ _id: 'a', title: 'Linen' }, { _id: 'b', title: 'Wool' }]);

    expect(result).toMatchObject({ success: false, indexed: 0, failed: 2, writeError: down });
    expect(result.errors[0].error).toMatch(/ENOTFOUND/);
    expect(reported(logs)).toEqual([]);
  });
});
