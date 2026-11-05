// src/features/domain-knowledge/domain-knowledge.api.handlers.errors.test.ts

/**
 * A knowledge entry request that fails on our side is answered without the error's text
 * (a database error is its SQL), with a request id, and logged once. An entry that is
 * gone is answered 404 as before and logged once as a warning.
 */

import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { expectInternalFailure, failedQuery } from '@/shared/test/error-answers';
import { reported, type LogLine } from '@/shared/test/log-recorder';

const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
const service = vi.hoisted(() => ({
  createKnowledgeEntry: vi.fn(),
  getKnowledgeEntryById: vi.fn(),
  getKnowledgeEntriesBySearchIndex: vi.fn(),
  updateKnowledgeEntry: vi.fn(),
  deleteKnowledgeEntry: vi.fn(),
  countKnowledgeEntries: vi.fn(),
  bulkCreateKnowledgeEntries: vi.fn(),
}));
vi.mock('./domain-knowledge.service', () => service);

import {
  handleCreateKnowledgeEntry,
  handleDeleteKnowledgeEntry,
  handleGetKnowledgeEntry,
  handleListKnowledgeEntries,
  handleUpdateKnowledgeEntry,
} from './domain-knowledge.api.handlers';

const request = (method: string, body?: unknown) =>
  new NextRequest('http://localhost/api/search-indexes/i1/knowledge/e1', { method, ...(body !== undefined && { body: JSON.stringify(body) }) });
const index = { params: Promise.resolve({ id: 'i1' }) };
const entry = { params: Promise.resolve({ id: 'i1', entryId: 'e1' }) };

beforeEach(() => {
  logs.length = 0;
  vi.clearAllMocks();
});

describe('a knowledge entry request', () => {
  it.each([
    ['listing entries', 'getKnowledgeEntriesBySearchIndex', () => handleListKnowledgeEntries(request('GET'), index), 'listKnowledgeEntries'],
    ['adding an entry', 'createKnowledgeEntry', () => handleCreateKnowledgeEntry(request('POST', { question: 'Q', answer: 'A' }), index), 'createKnowledgeEntry'],
    ['opening an entry', 'getKnowledgeEntryById', () => handleGetKnowledgeEntry(request('GET'), entry), 'getKnowledgeEntry'],
    ['changing an entry', 'updateKnowledgeEntry', () => handleUpdateKnowledgeEntry(request('PUT', { answer: 'B' }), entry), 'updateKnowledgeEntry'],
    ['deleting an entry', 'deleteKnowledgeEntry', () => handleDeleteKnowledgeEntry(request('DELETE'), entry), 'deleteKnowledgeEntry'],
  ] as const)('%s that fails on our side answers 500 without the SQL, with a request id, logged once', async (_, failing, call, operation) => {
    const down = failedQuery();
    service[failing].mockRejectedValue(down);

    const res = await call();

    expect(res.status).toBe(500);
    expectInternalFailure(await res.json(), logs, operation, down);
  });

  it('changing an entry that is gone answers 404 as before, logged once as a warning', async () => {
    service.updateKnowledgeEntry.mockRejectedValue(new Error('Knowledge entry not found: e1'));

    const res = await handleUpdateKnowledgeEntry(request('PUT', { answer: 'B' }), entry);
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body).toMatchObject({ code: 'NOT_FOUND', error: 'Knowledge entry not found', requestId: expect.any(String) });
    expect(reported(logs)).toEqual([
      expect.objectContaining({ level: 'warn', context: expect.objectContaining({ operation: 'updateKnowledgeEntry', requestId: body.requestId }) }),
    ]);
  });
});
