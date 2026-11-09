// src/features/search/providers/azure-ai-search/azure-search.provider.get-document.test.ts

/**
 * A key that doesn't exist is "not found", not an error, as on Elasticsearch, so Find Record
 * goes on to search for the item by name. Azure answers 404 for a missing key-shaped id and 400
 * for an id a key can't be (a product name: checked on a live service, 26 Oct). Other errors
 * still come back as errors.
 */

import { describe, it, expect, vi } from 'vitest';

import { reported, type LogLine } from '@/shared/test/log-recorder';

vi.mock('server-only', () => ({}));
const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
const { getDocument } = vi.hoisted(() => ({ getDocument: vi.fn() }));
vi.mock('./azure-client', () => ({ getSearchClient: () => ({ getDocument }), checkAzureHealth: vi.fn() }));

import { AzureSearchProvider } from './azure-search.provider';

describe('AzureSearchProvider.getDocument', () => {
  const provider = new AzureSearchProvider();

  it('returns not found, with no error, for a key that does not exist', async () => {
    getDocument.mockRejectedValueOnce(Object.assign(new Error('Not Found'), { statusCode: 404 }));

    expect(await provider.getDocument('products', 'XYZ-999')).toEqual({ found: false });
  });

  it('returns not found for an id a key cannot be, without asking Azure (it would answer 400)', async () => {
    getDocument.mockClear();

    expect(await provider.getDocument('products', 'Vesper & Co Crew Neck Sweater')).toEqual({ found: false });
    expect(await provider.getDocument('products', 'Crew Neck Sweater')).toEqual({ found: false });
    expect(getDocument).not.toHaveBeenCalled();
  });

  it('returns other failures as errors', async () => {
    const unavailable = Object.assign(new Error('Service Unavailable'), { statusCode: 503 });
    getDocument.mockRejectedValueOnce(unavailable);

    // With Azure's own error, so the API can explain it
    expect(await provider.getDocument('products', 'PROD-1')).toEqual({ found: false, error: 'Service Unavailable', cause: unavailable });
    // The search service turns it into a failure, and whoever answers logs it
    expect(reported(logs)).toEqual([]);
  });

  it('returns the document when the key exists', async () => {
    getDocument.mockResolvedValueOnce({ id: 'PROD-1', name: 'Crew Neck Sweater' });

    expect(await provider.getDocument('products', 'PROD-1')).toEqual({
      found: true,
      id: 'PROD-1',
      source: { name: 'Crew Neck Sweater' },
    });
  });
});
