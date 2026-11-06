// src/features/search-index/search-index.api.handlers.logging.test.ts

/**
 * A search index request that fails answers as before and is logged once, by the error
 * response, with the request id, the operation and the error: a warning when the
 * request was refused (not found, in use), an error when our side failed.
 */

import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConflictError } from '@/shared/errors/app-error';
import { reported, type LogLine } from '@/shared/test/log-recorder';

const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
vi.mock('@/shared/utils/auth-utils', () => ({ getCurrentUserId: async () => 'admin' }));
const service = vi.hoisted(() => ({
  deleteSearchIndex: vi.fn(),
  getSearchIndexById: vi.fn(),
  triggerReindex: vi.fn(),
  SearchIndexInUseError: class SearchIndexInUseError extends Error {},
}));
vi.mock('./search-index.service', () => service);
const fieldsService = vi.hoisted(() => ({
  deleteField: vi.fn(),
  FieldHasDependentsError: class FieldHasDependentsError extends Error {
    constructor(message: string, readonly dependents: string[]) { super(message); }
  },
}));
vi.mock('./search-index-fields.service', () => fieldsService);
vi.mock('@/features/data-source/data-source.service', () => ({ refreshSchemaForSearchIndex: vi.fn() }));

import { handleDeleteField, handleDeleteSearchIndex, handleGetSearchIndex, handleTriggerReindex } from './search-index.api.handlers';

const ID = '7f1c0c56-3a9e-4a51-9b3f-2f7b8c1d2e3f';
const req = (method: string) => new NextRequest(`http://localhost/api/search-indexes/${ID}`, { method });
const params = { params: Promise.resolve({ id: ID }) };

beforeEach(() => { logs.length = 0; });

describe('a search index request that fails', () => {
  it('logs a failure on our side once, as an error with the request id, the operation and the error', async () => {
    const down = new Error('connect ECONNREFUSED 127.0.0.1:5432');
    service.getSearchIndexById.mockRejectedValue(down);
    const res = await handleGetSearchIndex(req('GET'), params);
    const { requestId } = await res.json();

    expect(res.status).toBe(500);
    expect(reported(logs)).toEqual([
      expect.objectContaining({ level: 'error', context: expect.objectContaining({ requestId, operation: 'getSearchIndex', err: down }) }),
    ]);
  });

  it('answers a missing index as before and logs it once, as a warning with the error', async () => {
    const missing = new Error(`Search index ${ID} not found`);
    service.deleteSearchIndex.mockRejectedValue(missing);
    const res = await handleDeleteSearchIndex(req('DELETE'), params);
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body).toMatchObject({ code: 'NOT_FOUND', message: missing.message });
    expect(reported(logs)).toEqual([
      expect.objectContaining({ level: 'warn', context: expect.objectContaining({ requestId: body.requestId, operation: 'deleteSearchIndex', err: expect.objectContaining({ cause: missing }) }) }),
    ]);
  });

  it('answers an index in use as before and logs it once, as a warning', async () => {
    service.deleteSearchIndex.mockRejectedValue(new service.SearchIndexInUseError('Search index is used by Catalog'));
    const res = await handleDeleteSearchIndex(req('DELETE'), params);

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'CONFLICT', message: 'Search index is used by Catalog' });
    expect(reported(logs)).toEqual([expect.objectContaining({ level: 'warn', context: expect.objectContaining({ operation: 'deleteSearchIndex' }) })]);
  });

  it('answers a field others depend on as before, with the list, and logs it once, as a warning', async () => {
    fieldsService.deleteField.mockRejectedValue(new fieldsService.FieldHasDependentsError('Field is used by 2 fields', ['title_ngram', 'title_exact']));
    const res = await handleDeleteField(req('DELETE'), { params: Promise.resolve({ id: ID, fieldId: '12' }) });

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'CONFLICT', message: 'Field is used by 2 fields', details: { dependents: ['title_ngram', 'title_exact'] } });
    expect(reported(logs)).toEqual([expect.objectContaining({ level: 'warn', context: expect.objectContaining({ operation: 'deleteField' }) })]);
  });

  it('answers a reindex already running as a conflict and logs it once, as a warning', async () => {
    service.triggerReindex.mockRejectedValue(new ConflictError('A reindex is already running for this index'));
    const res = await handleTriggerReindex(req('POST'), params);

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'CONFLICT', message: 'A reindex is already running for this index' });
    expect(reported(logs)).toEqual([expect.objectContaining({ level: 'warn', context: expect.objectContaining({ operation: 'triggerReindex' }) })]);
  });
});
