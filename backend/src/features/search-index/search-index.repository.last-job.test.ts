// src/features/search-index/search-index.repository.last-job.test.ts

/**
 * setLastJob on real Postgres (PGlite with the main migrations): it stores the job and
 * gives back the index's name, which recordLastJob needs to clear the by-name cache.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createAppTestDb, type AppTestDb } from '@/shared/test/app-test-db';

let testDb: AppTestDb;
vi.mock('@/db/index', () => ({
  get db() {
    return testDb.db;
  },
}));

import { searchIndex } from '../../../db/schema';

import { setLastJob } from './search-index.repository';

beforeAll(async () => {
  testDb = await createAppTestDb();
}, 30_000);
afterAll(async () => {
  await testDb.close();
});

describe('setLastJob', () => {
  it("stores the job and gives the index's name", async () => {
    const [row] = await testDb.db.insert(searchIndex).values({ name: 'shop', displayName: 'Shop', searchType: 'lexical' }).returning();
    const job = { kind: 'reindex', status: 'running', startedAt: '2026-11-05T10:00:00.000Z' } as const;

    expect(await setLastJob(row.id, job)).toBe('shop');
    const [stored] = await testDb.db.select({ lastJob: searchIndex.lastJob }).from(searchIndex);
    expect(stored.lastJob).toEqual(job);
  });

  it('gives undefined for an index that does not exist', async () => {
    expect(await setLastJob(crypto.randomUUID(), { kind: 'reindex', status: 'running', startedAt: '2026-11-05T10:00:00.000Z' })).toBeUndefined();
  });
});
