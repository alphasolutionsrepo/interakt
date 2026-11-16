// src/features/ingestion-keys/ingestion-key.rate-limit.integration.test.ts

/**
 * Rate limits for servers calling the document routes with an ingestion key, through the real
 * routes, gates and keys on a real Postgres (PGlite, all migrations):
 *  - failed key checks are counted per address across the document routes (reads included);
 *    past the limit a wrong key gets 429, and a live key still goes through;
 *  - a real key is counted on its own, per route, whatever other callers send;
 *  - the answers are the same whether Managed indexes is on or off;
 *  - a request's key is looked up once, however many checks ask for it.
 */

import { randomUUID } from 'node:crypto';

import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const lookups = vi.hoisted(() => ({ count: 0, fails: false, hang: new Set<string>(), release: [] as (() => void)[] }));
vi.mock('./ingestion-key.repository', async (original) => {
  const real = await original<typeof import('./ingestion-key.repository')>();
  return {
    ...real,
    getByPrefix: async (prefix: string) => {
      lookups.count++;
      // A lookup that hangs until the test releases it (a slow database)
      if (lookups.hang.has(prefix)) await new Promise<void>((resolve) => lookups.release.push(resolve));
      await new Promise((resolve) => setTimeout(resolve, 1));
      if (lookups.fails) throw new Error('database down');
      return real.getByPrefix(prefix);
    },
  };
});
// Requests with a live key reach the document handlers: keep them off the search engine
vi.mock('@/features/document-indexing/document-writer.service', async (original) =>
  (await import('@/shared/test/document-writer-stub')).documentWriterWithoutEngine(original));
const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
let testDb: AppTestDb;
vi.mock('@/db/index', () => ({ get db() { return testDb.db; } }));
const signedIn = vi.hoisted(() => ({ session: null as { user: { id: string } } | null }));
vi.mock('@/features/auth/auth.api.handlers', () => ({ auth: async () => signedIn.session }));

import { clearKeyLookupCache, createIngestionKey, revokeIngestionKey } from './ingestion-key.service';

import * as documentRoute from '@/app/api/search-indexes/[id]/documents/[documentId]/route';
import * as bulkRoute from '@/app/api/search-indexes/[id]/documents/bulk/route';
import * as deleteByFilterRoute from '@/app/api/search-indexes/[id]/documents/delete-by-filter/route';
import * as documentsRoute from '@/app/api/search-indexes/[id]/documents/route';
import { globalSearchSettings } from '@/db/schema/global-search-settings.schema';
import { searchIndex } from '@/db/schema/search-index.schema';
import { user } from '@/db/schema/users.schema';
import { ADMIN_ROLE_ID } from '@/features/access/permissions';
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
  await clearKeyLookupCache();
  await testDb.db.delete(globalSearchSettings);
  clearFeatureSwitchCache();
  [index] = await testDb.db.insert(searchIndex).values({ name: `limits-${++n}`, displayName: 'Limits', searchType: 'lexical' }).returning();
  ({ plaintextKey: realKey } = await createIngestionKey({ name: 'k', operations: ['write', 'delete'], searchIndexIds: [index.id] }));
});

async function send(route: unknown, method: string, path: string, key: string, address: string | null, indexId = index.id): Promise<Answer> {
  const req = new NextRequest(`http://localhost/api/search-indexes/${indexId}/documents${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(key && { Authorization: `Bearer ${key}` }), ...(address && { 'X-Forwarded-For': address }) },
    ...(method === 'POST' && { body: '{"dryRun":true}' }),
  });
  const res = await (route as Route)(req, { params: Promise.resolve({ id: indexId }) });
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

  it('hold for the same wrong key sent in parallel: 20 answered 401, the rest 429, one database read', async () => {
    lookups.count = 0;
    const answers = await Promise.all(Array.from({ length: 30 }, () => list('ik_0badc0de_nope', '1.1.1.8')));
    const statuses = answers.map((a) => a.status).sort();
    expect(statuses.filter((s) => s === 401)).toHaveLength(20);
    expect(statuses.filter((s) => s === 429)).toHaveLength(10);
    expect(lookups.count).toBe(1);
  });

  it('hold for different wrong keys sent in parallel: 20 answered 401, the rest 429', async () => {
    const answers = await Promise.all(Array.from({ length: 30 }, (_, i) => list(`ik_${String(i).padStart(8, '0')}_nope`, '1.1.1.13')));
    const statuses = answers.map((a) => a.status);
    expect(statuses.filter((s) => s === 401)).toHaveLength(20);
    expect(statuses.filter((s) => s === 429)).toHaveLength(10);
  });

  it("don't make a live key wait for other lookups from its address, even ones that hang", async () => {
    const wrong = Array.from({ length: 25 }, (_, i) => `ik_${String(i).padStart(8, '0')}_nope`);
    for (const key of wrong) lookups.hang.add(key.split('_').slice(0, 2).join('_'));
    const stuck = wrong.map((key) => list(key, '1.1.1.14'));
    try {
      // Until at least 20 of them are inside a lookup that hangs
      while (lookups.release.length < 20) await new Promise((resolve) => setTimeout(resolve, 5));
      const live = await Promise.race([
        deleteByFilter(realKey, '1.1.1.14'),
        new Promise<'waited'>((resolve) => setTimeout(() => resolve('waited'), 500)),
      ]);
      expect(live).not.toBe('waited');
      expect((live as Answer).status).not.toBe(429);
    } finally {
      lookups.hang.clear();
      for (const release of lookups.release.splice(0)) release();
      await Promise.all(stuck);
    }
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

  it("let requests waiting on a lookup go on when that lookup fails, without counting it", async () => {
    for (let i = 0; i < 19; i++) await list('ik_0badc0de_nope', '1.1.1.12');
    lookups.count = 0;
    lookups.fails = true;
    let answers: Answer[];
    try {
      // Another key, the same one at once: one read, shared by all ten, which fails
      answers = await Promise.all(Array.from({ length: 10 }, () => list('ik_0badf00d_nope', '1.1.1.12')));
    } finally {
      lookups.fails = false;
    }
    expect(answers.map((a) => a.status)).toEqual(Array(10).fill(500));
    expect(lookups.count).toBe(1);
    // Nothing is left in flight: the next request is looked up and counted as usual
    expect((await list('ik_0badc0de_nope', '1.1.1.12')).status).toBe(401);
    expect((await list('ik_0badc0de_nope', '1.1.1.12')).status).toBe(429);
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
    // A live key without an address still goes through; a wrong key from an address has its own count
    expect((await deleteByFilter(realKey, null)).status).not.toBe(429);
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

  it('hold back only wrong keys from an address over the limit: a live key from it goes through', async () => {
    for (let i = 0; i < 20; i++) await list('ik_0badc0de_nope', '1.1.1.2');
    expect((await list('ik_0badc0de_nope', '1.1.1.2')).status).toBe(429);
    const live = await deleteByFilter(realKey, '1.1.1.2');
    expect(live.status).not.toBe(429);
    expect(live.limit).toBe('20');
    expect((await list('ik_0badc0de_nope', '1.1.1.2')).status).toBe(429);
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

  it('is counted separately on each of its indexes', async () => {
    const [other] = await testDb.db.insert(searchIndex).values({ name: `limits-other-${n}`, displayName: 'Limits', searchType: 'lexical' }).returning();
    const { plaintextKey: both } = await createIngestionKey({ name: 'k2', operations: ['write', 'delete'], searchIndexIds: [index.id, other.id] });
    for (let i = 0; i < 20; i++) await deleteByFilter(both, '5.5.7.1');
    expect((await deleteByFilter(both, '5.5.7.1')).status).toBe(429);
    const onOther = await send(deleteByFilterRoute.POST, 'POST', '/delete-by-filter', both, '5.5.7.1', other.id);
    expect(onOther.status).not.toBe(429);
    expect(onOther.limit).toBe('20');
  });

  it('is counted per index on bulk writes too (60 a minute)', async () => {
    const [other] = await testDb.db.insert(searchIndex).values({ name: `limits-bulk-${n}`, displayName: 'Limits', searchType: 'lexical' }).returning();
    const { plaintextKey: both } = await createIngestionKey({ name: 'k3', operations: ['write'], searchIndexIds: [index.id, other.id] });
    const bulk = (indexId: string) => send(bulkRoute.POST, 'POST', '/bulk', both, '5.5.9.1', indexId);
    for (let i = 0; i < 60; i++) expect((await bulk(index.id)).limit).toBe('60');
    expect((await bulk(index.id)).status).toBe(429);
    expect((await bulk(other.id)).status).not.toBe(429);
  });

  it('counts index ids outside its scope on one count of its own, apart from its indexes', async () => {
    const before = rateLimiter.size();
    for (let i = 0; i < 20; i++) {
      const res = await send(deleteByFilterRoute.POST, 'POST', '/delete-by-filter', realKey, '5.5.8.1', randomUUID());
      expect(res.status).toBe(403);
    }
    // Twenty made-up ids: one counter for the key (plus the address's failed-check count, unused)
    expect(rateLimiter.size() - before).toBeLessThanOrEqual(2);
    expect((await send(deleteByFilterRoute.POST, 'POST', '/delete-by-filter', realKey, '5.5.8.1', randomUUID())).status).toBe(429);
    // Its own index keeps its full allowance
    expect((await deleteByFilter(realKey, '5.5.8.1')).limit).toBe('20');
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

describe('a signed-in admin (no key)', () => {
  it('is counted by address with the route limit, apart from the failed-check count', async () => {
    const [admin] = await testDb.db.insert(user).values({ email: `rl${n}@x.test`, roleId: ADMIN_ROLE_ID, isActive: true, firstName: 'A' }).returning();
    signedIn.session = { user: { id: admin.id } };
    try {
      for (let i = 0; i < 20; i++) {
        const res = await deleteByFilter('', '6.6.6.1');
        expect(res.status).not.toBe(429);
        expect(res.limit).toBe('20');
      }
      expect((await deleteByFilter('', '6.6.6.1')).status).toBe(429);
    } finally {
      signedIn.session = null;
    }
    // The address has used no failed key checks
    expect((await list('ik_0badc0de_nope', '6.6.6.1')).status).toBe(401);
  });

  it('is counted once per route across indexes: the index id is checked after the limit', async () => {
    const [admin] = await testDb.db.insert(user).values({ email: `rl-b${n}@x.test`, roleId: ADMIN_ROLE_ID, isActive: true, firstName: 'A' }).returning();
    signedIn.session = { user: { id: admin.id } };
    try {
      for (let i = 0; i < 20; i++) await deleteByFilter('', '6.6.6.2');
      const [other] = await testDb.db.insert(searchIndex).values({ name: `limits-admin-${n}`, displayName: 'Limits', searchType: 'lexical' }).returning();
      expect((await send(deleteByFilterRoute.POST, 'POST', '/delete-by-filter', '', '6.6.6.2', other.id)).status).toBe(429);
    } finally {
      signedIn.session = null;
    }
  });
});

describe('a request without a key', () => {
  it('adds one counter however many index ids it names, so made-up ids leave the store as it was', async () => {
    const before = rateLimiter.size();
    for (let i = 0; i < 20; i++) expect((await send(deleteByFilterRoute.POST, 'POST', '/delete-by-filter', '', '6.6.7.1', randomUUID())).status).toBe(401);
    expect(rateLimiter.size() - before).toBe(1);
    expect((await send(deleteByFilterRoute.POST, 'POST', '/delete-by-filter', '', '6.6.7.1', randomUUID())).status).toBe(429);
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

  it('is refused at once when revoked or expired while its lookup is cached', async () => {
    const { plaintextKey } = await createIngestionKey({ name: 's', operations: ['write', 'delete'], searchIndexIds: [index.id], expiresAt: new Date(Date.now() + 5_000) });
    expect((await deleteByFilter(plaintextKey, '8.8.8.9')).status).not.toBe(401);
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      // Past its expiry, inside the cache time: judged from the cached row at the time of use
      vi.setSystemTime(Date.now() + 6_000);
      lookups.count = 0;
      expect((await deleteByFilter(plaintextKey, '8.8.8.9')).status).toBe(401);
      expect(lookups.count).toBe(0);
    } finally {
      vi.useRealTimers();
    }
    const { plaintextKey: other, key: otherKey } = await createIngestionKey({ name: 't', operations: ['write', 'delete'], searchIndexIds: [index.id] });
    expect((await deleteByFilter(other, '8.8.8.10')).status).not.toBe(401);
    await revokeIngestionKey(otherKey.id, index.id);
    expect((await deleteByFilter(other, '8.8.8.10')).status).toBe(401);
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
