// src/features/search/providers/azure-ai-search/azure-engine.provider.get-document-by-id.test.ts

/**
 * A document Azure doesn't have is a miss, as on Elasticsearch; a lookup Azure couldn't
 * answer is a failure with its cause. The document API answers the first with 404 and
 * explains the second.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/shared/logger/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
const { getDocument } = vi.hoisted(() => ({ getDocument: vi.fn() }));
vi.mock('./azure-client', () => ({
  getIndexClient: vi.fn(),
  getSearchClient: () => ({ getDocument }),
  checkAzureHealth: vi.fn(),
}));

import { AzureEngineProvider } from './azure-engine.provider';

const provider = new AzureEngineProvider();

describe('AzureEngineProvider.getDocumentById', () => {
  it('answers a document that is not there as a miss', async () => {
    getDocument.mockRejectedValueOnce(Object.assign(new Error('Not Found'), { name: 'RestError', statusCode: 404 }));
    expect(await provider.getDocumentById('idx', 'd1')).toEqual({ found: false });
  });

  it('answers a lookup Azure could not answer as a failure, with its cause', async () => {
    const down = Object.assign(new Error('Service Unavailable'), { name: 'RestError', statusCode: 503 });
    getDocument.mockRejectedValueOnce(down);
    expect(await provider.getDocumentById('idx', 'd1')).toMatchObject({ found: false, error: expect.any(String), cause: down });
  });
});

describe('AzureEngineProvider.getDocumentById with an id Azure cannot hold as a key', () => {
  it('answers it as a miss, without asking Azure (it would answer 400, not 404)', async () => {
    getDocument.mockClear();
    expect(await provider.getDocumentById('idx', 'Blue & Gold Shirt')).toEqual({ found: false });
    expect(getDocument).not.toHaveBeenCalled();
  });
});
