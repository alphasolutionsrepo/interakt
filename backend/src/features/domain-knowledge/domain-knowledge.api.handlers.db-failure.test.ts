// src/features/domain-knowledge/domain-knowledge.api.handlers.db-failure.test.ts

/**
 * A knowledge entry request whose database query fails is logged once, by the answer:
 * the repository passes the error on without a log line of its own. Through the real
 * handler, service and repository; only the database is stubbed, failing every query.
 */

import { NextRequest } from 'next/server';
import { beforeEach, describe, it, vi } from 'vitest';

import { expectInternalFailure } from '@/shared/test/error-answers';
import { type LogLine } from '@/shared/test/log-recorder';

const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('server-only', () => ({}));
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
const down = vi.hoisted(() => Object.assign(new Error('Failed query: select "id" from "domain_knowledge" where "search_index_id" = $1'), { code: '57P01' }));
vi.mock('@/db/index', () => {
  const failing: unknown = new Proxy(() => undefined, {
    get: (_target, key) => (key === 'then' ? undefined : failing),
    apply: () => { throw down; },
  });
  return { db: failing };
});

import { handleGetKnowledgeEntry, handleListKnowledgeEntries } from './domain-knowledge.api.handlers';

beforeEach(() => { logs.length = 0; });

describe('a knowledge entry request whose query fails', () => {
  it.each([
    ['listing entries', () => handleListKnowledgeEntries(new NextRequest('http://localhost/api/search-indexes/i1/knowledge'), { params: Promise.resolve({ id: 'i1' }) }), 'listKnowledgeEntries'],
    ['opening an entry', () => handleGetKnowledgeEntry(new NextRequest('http://localhost/api/search-indexes/i1/knowledge/e1'), { params: Promise.resolve({ id: 'i1', entryId: 'e1' }) }), 'getKnowledgeEntry'],
  ] as const)('%s is logged once, by the answer', async (_, call, operation) => {
    const res = await call();
    expectInternalFailure(await res.json(), logs, operation, down);
  });
});
