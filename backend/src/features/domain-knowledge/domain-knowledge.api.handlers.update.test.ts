// src/features/domain-knowledge/domain-knowledge.api.handlers.update.test.ts

/**
 * Changing a knowledge entry: an entry that is gone answers 404, logged once as a
 * warning; a database failure answers 500, logged once as an error, whatever its text
 * says (the driver's message carries the query's values, so it can say "not found").
 * Through the real handler, service and repository; each database query answers in turn
 * from a script.
 */

import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { expectInternalFailure } from '@/shared/test/error-answers';
import { reported, type LogLine } from '@/shared/test/log-recorder';

const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('server-only', () => ({}));
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
// What each awaited query answers, in order: rows, or an error it fails with
const answers = vi.hoisted(() => [] as unknown[]);
vi.mock('@/db/index', () => {
  const query: unknown = new Proxy(() => undefined, {
    get: (_target, key) => key === 'then'
      ? (resolve: (value: unknown) => void, reject: (err: unknown) => void) => {
        const next = answers.shift();
        return next instanceof Error ? reject(next) : resolve(next);
      }
      : query,
    apply: () => query,
  });
  return { db: query };
});
vi.mock('./domain-knowledge.elasticsearch', () => ({
  knowledgeIndexExists: async () => true,
  createKnowledgeIndex: vi.fn(),
  deleteKnowledgeIndex: vi.fn(),
  indexKnowledgeEntry: vi.fn(async () => ({ success: true })),
  bulkIndexKnowledgeEntries: vi.fn(),
  removeKnowledgeEntry: vi.fn(),
  searchKnowledge: vi.fn(),
  buildKnowledgeESDocument: vi.fn(() => ({})),
}));

import { handleUpdateKnowledgeEntry } from './domain-knowledge.api.handlers';

const ENTRY = { id: 'e1', searchIndexId: 'i1', question: 'Where is the sitemap?', answer: 'At /sitemap', tags: '[]', priority: 0, isActive: true };

const update = () => handleUpdateKnowledgeEntry(
  new NextRequest('http://localhost/api/search-indexes/i1/knowledge/e1', { method: 'PUT', body: JSON.stringify({ answer: 'Page not found? Try the sitemap' }) }),
  { params: Promise.resolve({ id: 'i1', entryId: 'e1' }) },
);

beforeEach(() => {
  logs.length = 0;
  answers.length = 0;
});

describe('changing a knowledge entry', () => {
  it.each([
    ['is gone', [undefined]],
    ['was deleted after it was read', [ENTRY, []]],
  ])('that %s answers 404, logged once as a warning', async (_, script) => {
    answers.push(...script);

    const res = await update();
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body).toMatchObject({ code: 'NOT_FOUND', message: 'Knowledge entry not found', requestId: expect.any(String) });
    expect(reported(logs)).toEqual([
      expect.objectContaining({ level: 'warn', context: expect.objectContaining({ operation: 'updateKnowledgeEntry', requestId: body.requestId }) }),
    ]);
  });

  it('whose write fails answers 500, logged once as an error, though its text says "not found"', async () => {
    // As the driver reports it: the query and its values, which are the new answer
    const down = new Error('Failed query: update "domain_knowledge" set "answer" = $1 where "id" = $2\nparams: Page not found? Try the sitemap,e1');
    answers.push(ENTRY, down);

    const res = await update();

    expect(res.status).toBe(500);
    expectInternalFailure(await res.json(), logs, 'updateKnowledgeEntry', down);
  });
});
