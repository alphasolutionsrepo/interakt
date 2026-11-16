// src/features/ingestion-keys/ingestion-key.rate-limit.integration.test.ts

/**
 * Rate limits for servers calling the document routes with an ingestion key, through the real
 * routes, gates and keys on a real Postgres (PGlite, all migrations):
 *  - failed key checks are counted per address across the document routes (reads included),
 *    and an address over the limit is refused before its key is looked up;
 *  - a real key is counted on its own, per route, whatever other callers send;
 *  - the answers are the same whether Managed indexes is on or off;
 *  - a request's key is looked up once, however many checks ask for it.
 */

import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const lookups = vi.hoisted(() => ({ count: 0, fails: false }));
vi.mock('./ingestion-key.repository', async (original) => {
  const real = await original<typeof import('./ingestion-key.repository')>();
  return {
    ...real,
    getByPrefix: async (prefix: string) => {
      lookups.count++;
      if (lookups.fails) throw new Error('database down');
      return real.getByPrefix(prefix);
    },
  };
});
const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
let testDb: AppTestDb;
vi.mock('@/db/index', () => ({ get db() { return testDb.db; } }));
vi.mock('@/features/auth/auth.api.handlers', () => ({ auth: async () => null }));

import { createIngestionKey, revokeIngestionKey } from './ingestion-key.service';

import * as documentRoute from '@/app/api/search-indexes/[id]/documents/[documentId]/route';
import * as deleteByFilterRoute from '@/app/api/search-indexes/[id]/documents/delete-by-filter/route';
import * as documentsRoute from '@/app/api/search-indexes/[id]/documents/route';
import { globalSearchSettings } from '@/db/schema/global-search-settings.schema';
import { searchIndex } from '@/db/schema/search-index.schema';
import { clearFeatureSwitchCache } from '@/features/feature-switches/feature-switches.service';
import { updateFeaturesOff } from '@/features/global-settings';
import { clientLabel } from '@/shared/api/client-ip';
import { rateLimiter } from '@/shared/api/rate-limit';
import { createAppTestDb, type AppTestDb } from '@/shared/test/app-test-db';
import type { LogLine } from '@/shared/test/log-recorder';

type Route = (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
type Answer = { status: number; limit: string | null; retryAfter: string | null };

let index: { id: string };
let realKey: string;
let n = 0;

beforeAll(async () => { testDb = await createAppTestDb(); }, 60_000);
afterAll(async () => { await testDb.close(); });
beforeEach(async () => {
  rateLimiter.clear();
  await testDb.db.delete(globalSearchSettings);
  clearFeatureSwitchCache();
  [index] = await testDb.db.insert(searchIndex).values({ name: `limits-${++n}`, displayName: 'Limits', searchType: 'lexical' }).returning();
  ({ plaintextKey: realKey } = await createIngestionKey({ name: 'k', operations: ['write', 'delete'], searchIndexIds: [index.id] }));
});

async function send(route: unknown, method: string, path: string, key: string, address: string | null): Promise<Answer> {
  const req = new NextRequest(`http://localhost/api/search-indexes/${index.id}/documents${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, ...(address && { 'X-Forwarded-For': address }) },
    ...(method === 'POST' && { body: '{"dryRun":true}' }),
  });
  const res = await (route as Route)(req, { params: Promise.resolve({ id: index.id }) });
  return { status: res.status, limit: res.headers.get('X-RateLimit-Limit'), retryAfter: res.headers.get('Retry-After') };
}
const list = (key: string, address: string | null) => send(documentsRoute.GET, 'GET', '', key, address);
const deleteByFilter = (key: string, address: string | null) => send(deleteByFilterRoute.POST, 'POST', '/delete-by-filter', key, address);
const forged = () => `${realKey.split('_').slice(0, 2).join('_')}_madeUpSecret`;

describe('failed key checks', () => {
  it('are counted per address across the document routes, reads included: the 21st in a minute gets 429', async () => {
    for (let i = 0; i < 20; i++) {
      const res = await (i % 2 ? list : deleteByFilter)('ik_0badc0de_nope', '1.1.1.1');
      expect(res.status).toBe(401);
    }
    const refused = await list('ik_0badc0de_nope', '1.1.1.1');
    expect(refused.status).toBe(429);
    expect(Number(refused.retryAfter)).toBeGreaterThan(0);
  });

  it('hold for attempts sent in parallel: only 20 get a key lookup, the rest 429', async () => {
    lookups.count = 0;
    const answers = await Promise.all(Array.from({ length: 30 }, () => list('ik_0badc0de_nope', '1.1.1.8')));
    const statuses = answers.map((a) => a.status).sort();
    expect(statuses.filter((s) => s === 401)).toHaveLength(20);
    expect(statuses.filter((s) => s === 429)).toHaveLength(10);
    expect(lookups.count).toBe(20);
  });

  it("let a server's own parallel requests through: they wait for lookups, they aren't refused", async () => {
    const burst = await Promise.all(Array.from({ length: 30 }, () => list(realKey, '1.1.1.11')));
    expect(burst.map((a) => a.status)).not.toContain(429);
  });

  it("don't include a live key's requests, even in parallel next to recent failures", async () => {
    for (let i = 0; i < 19; i++) await list('ik_0badc0de_nope', '1.1.1.9');
    const live = await Promise.all(Array.from({ length: 5 }, () => list(realKey, '1.1.1.9')));
    expect(live.map((a) => a.status)).not.toContain(429);
    expect((await list('ik_0badc0de_nope', '1.1.1.9')).status).toBe(401);
    expect((await list('ik_0badc0de_nope', '1.1.1.9')).status).toBe(429);
  });

  it("don't include a lookup that failed (database down): the route answers it as an error", async () => {
    lookups.fails = true;
    try {
      for (let i = 0; i < 25; i++) expect((await list('ik_0badc0de_nope', '1.1.1.10')).status).toBe(500);
    } finally {
      lookups.fails = false;
    }
    expect((await list('ik_0badc0de_nope', '1.1.1.10')).status).toBe(401);
  });

  it('include a bearer that is not an ingestion key at all', async () => {
    for (let i = 0; i < 20; i++) expect((await list('not-a-key', '1.1.1.3')).status).toBe(401);
    expect((await list('not-a-key', '1.1.1.3')).status).toBe(429);
  });

  it('log one warning when an address reaches the limit, not one per refused request', async () => {
    logs.length = 0;
    for (let i = 0; i < 25; i++) await list('ik_0badc0de_nope', '1.1.1.4');
    expect(logs.filter((l) => l.message === 'A client reached the failed ingestion key check limit')).toEqual([
      expect.objectContaining({ level: 'warn', context: expect.objectContaining({ client: clientLabel({ key: '1.1.1.4', shared: false }), limit: 20 }) }),
    ]);
    // The address itself is not logged
    expect(JSON.stringify(logs)).not.toContain('1.1.1.4');
  });

  it('start again once their minute is over', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      for (let i = 0; i < 20; i++) await list('ik_0badc0de_nope', '1.1.1.6');
      expect((await list('ik_0badc0de_nope', '1.1.1.6')).status).toBe(429);
      vi.advanceTimersByTime(61_000);
      expect((await list('ik_0badc0de_nope', '1.1.1.6')).status).toBe(401);
    } finally {
      vi.useRealTimers();
    }
  });

  it('share one count at ten times the limit when there is no trusted address, apart from addressed clients', async () => {
    for (let i = 0; i < 200; i++) expect((await list('ik_0badc0de_nope', null)).status).toBe(401);
    expect((await list('ik_0badc0de_nope', null)).status).toBe(429);
    // A real key without an address waits with them; one from an address is not held back
    expect((await deleteByFilter(realKey, null)).status).toBe(429);
    expect((await list('ik_0badc0de_nope', '1.1.1.7')).status).toBe(401);
  });

  it('count anything in the header that is not an IP address as no address: one shared count, not one per value', async () => {
    for (let i = 0; i < 25; i++) expect((await list('ik_0badc0de_nope', `junk-${i}`)).status).toBe(401);
    expect(rateLimiter.size()).toBe(1);
  });

  it("don't include a live key refused for its scope (403): that is a key check that passed", async () => {
    const [other] = await testDb.db.insert(searchIndex).values({ name: `other-${++n}`, displayName: 'Other', searchType: 'lexical' }).returning();
    const { plaintextKey: elsewhere } = await createIngestionKey({ name: 'o', operations: ['write'], searchIndexIds: [other.id] });
    for (let i = 0; i < 25; i++) expect((await list(elsewhere, '1.1.1.5')).status).toBe(403);
  });

  it('refuse an address over the limit before looking its key up', async () => {
    for (let i = 0; i < 20; i++) await list('ik_0badc0de_nope', '1.1.1.2');
    lookups.count = 0;
    expect((await list(realKey, '1.1.1.2')).status).toBe(429);
    expect(lookups.count).toBe(0);
  });

  it("include a real key's prefix with a made-up secret, and don't hold the real key elsewhere", async () => {
    for (let i = 0; i < 20; i++) expect((await deleteByFilter(forged(), '3.3.3.3')).status).toBe(401);
    expect((await deleteByFilter(forged(), '3.3.3.3')).status).toBe(429);
    const real = await deleteByFilter(realKey, '4.4.4.4');
    expect(real.status).not.toBe(429);
    expect(real.status).not.toBe(401);
  });
});

describe('a real key', () => {
  it('is counted once per route on single documents (300 a minute), not once per document id', async () => {
    const remove = async (documentId: string) => {
      const req = new NextRequest(`http://localhost/api/search-indexes/${index.id}/documents/${documentId}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${realKey}`, 'X-Forwarded-For': '6.6.6.6' },
      });
      const res = await (documentRoute.DELETE as unknown as (r: NextRequest, c: { params: Promise<{ id: string; documentId: string }> }) => Promise<Response>)(
        req, { params: Promise.resolve({ id: index.id, documentId }) });
      return { status: res.status, remaining: res.headers.get('X-RateLimit-Remaining') };
    };
    expect((await remove('doc-1')).remaining).toBe('299');
    expect((await remove('doc-2')).remaining).toBe('298');
  });

  it('is counted on its own, with the route limit (20 a minute on delete-by-filter), whatever its address', async () => {
    for (let i = 0; i < 20; i++) {
      const res = await deleteByFilter(realKey, `5.5.5.${i}`);
      expect(res.status).not.toBe(429);
      expect(res.limit).toBe('20');
    }
    expect((await deleteByFilter(realKey, '5.5.5.99')).status).toBe(429);
  });

  it('is counted separately on each route', async () => {
    for (let i = 0; i < 20; i++) await deleteByFilter(realKey, '5.5.6.1');
    expect((await deleteByFilter(realKey, '5.5.6.1')).status).toBe(429);
    const upload = await send(documentsRoute.POST, 'POST', '', realKey, '5.5.6.1');
    expect(upload.status).not.toBe(429);
    expect(upload.limit).toBe('30');
  });

  it('is looked up once per request', async () => {
    lookups.count = 0;
    await deleteByFilter(realKey, '6.6.6.6');
    expect(lookups.count).toBe(1);
  });
});

describe('a key that is revoked or expired', () => {
  it('counts as a failed check for its address', async () => {
    const { plaintextKey: revoked, key } = await createIngestionKey({ name: 'r', operations: ['write'], searchIndexIds: [index.id] });
    await revokeIngestionKey(key.id, index.id);
    const { plaintextKey: expired } = await createIngestionKey({ name: 'e', operations: ['write'], searchIndexIds: [index.id], expiresAt: new Date(Date.now() - 60_000) });
    for (let i = 0; i < 10; i++) expect((await deleteByFilter(revoked, '8.8.8.8')).status).toBe(401);
    for (let i = 0; i < 10; i++) expect((await deleteByFilter(expired, '8.8.8.8')).status).toBe(401);
    expect((await deleteByFilter(revoked, '8.8.8.8')).status).toBe(429);
  });
});

describe('a failed key lookup (database down)', () => {
  it('is answered 500 by the route, not thrown', async () => {
    lookups.fails = true;
    try {
      expect((await deleteByFilter(realKey, '9.9.9.9')).status).toBe(500);
      expect((await list(realKey, '9.9.9.9')).status).toBe(500);
    } finally {
      lookups.fails = false;
    }
  });
});

describe('with Managed indexes off', () => {
  it('answers a wrong key as with the area on, and counts it the same', async () => {
    const on = await deleteByFilter('ik_0badc0de_nope', '7.7.7.7');
    await updateFeaturesOff(() => ['managed-indexes']);
    clearFeatureSwitchCache();
    rateLimiter.clear();
    const off = await deleteByFilter('ik_0badc0de_nope', '7.7.7.7');
    expect(off).toEqual(on);
    for (let i = 0; i < 19; i++) await deleteByFilter('ik_0badc0de_nope', '7.7.7.7');
    expect((await deleteByFilter('ik_0badc0de_nope', '7.7.7.7')).status).toBe(429);
  });
});
