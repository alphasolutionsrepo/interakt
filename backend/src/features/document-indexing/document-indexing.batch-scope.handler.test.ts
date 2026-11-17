// src/features/document-indexing/document-indexing.batch-scope.handler.test.ts

/**
 * An upload batch is read and cancelled through its own index only: a server holding an
 * ingestion key for one index gets "not found" for another index's batch, and that batch keeps
 * running. The real batch route, its guard, the key check and the batch queries run on an
 * in-memory Postgres (PGlite, all migrations).
 */

import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

let testDb: AppTestDb;
vi.mock('@/db/index', () => ({ get db() { return testDb.db; } }));
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger([]));
vi.mock('@/features/auth/auth.api.handlers', () => ({ auth: async () => null }));

import * as batchRoute from '@/app/api/search-indexes/[id]/documents/batches/[batchId]/route';
import { indexingBatches } from '@/db/schema/indexing-batches.schema';
import { searchIndex } from '@/db/schema/search-index.schema';
import { clearKeyLookupCache, createIngestionKey } from '@/features/ingestion-keys/ingestion-key.service';
import { rateLimiter } from '@/shared/api/rate-limit';
import { createAppTestDb, type AppTestDb } from '@/shared/test/app-test-db';

let shop: string;
let blog: string;
let shopKey: string;
let blogKey: string;
let blogBatch: string;

beforeAll(async () => {
  testDb = await createAppTestDb();
  [{ id: shop }, { id: blog }] = await testDb.db.insert(searchIndex).values([
    { name: 'shop', displayName: 'Shop', searchType: 'lexical' },
    { name: 'blog', displayName: 'Blog', searchType: 'lexical' },
  ]).returning();
  ({ plaintextKey: shopKey } = await createIngestionKey({ name: 'shop', operations: ['write'], searchIndexIds: [shop] }));
  ({ plaintextKey: blogKey } = await createIngestionKey({ name: 'blog', operations: ['write'], searchIndexIds: [blog] }));
  [{ id: blogBatch }] = await testDb.db.insert(indexingBatches)
    .values({ searchIndexId: blog, status: 'processing', totalDocuments: 10, startedAt: new Date() })
    .returning();
}, 60_000);

afterAll(() => testDb.close());
beforeEach(async () => { rateLimiter.clear(); await clearKeyLookupCache(); });

type Handler = (req: NextRequest, ctx: { params: Promise<{ id: string; batchId: string }> }) => Promise<Response>;
function send(handler: unknown, method: string, indexId: string, batchId: string, key: string) {
  const req = new NextRequest(`http://localhost/api/search-indexes/${indexId}/documents/batches/${batchId}`, {
    method, headers: { authorization: `Bearer ${key}` },
  });
  return (handler as Handler)(req, { params: Promise.resolve({ id: indexId, batchId }) });
}
const status = (indexId: string, batchId: string, key: string) => send(batchRoute.GET, 'GET', indexId, batchId, key);
const cancel = (indexId: string, batchId: string, key: string) => send(batchRoute.DELETE, 'DELETE', indexId, batchId, key);
const blogBatchStatus = async () =>
  (await testDb.db.select({ status: indexingBatches.status }).from(indexingBatches).where(eq(indexingBatches.id, blogBatch)))[0].status;

describe("another index's upload batch, with a key for one index", () => {
  it('is not found through the index the key is for', async () => {
    expect((await status(shop, blogBatch, shopKey)).status).toBe(404);
  });

  it('is not cancelled through the index the key is for, and keeps running', async () => {
    expect((await cancel(shop, blogBatch, shopKey)).status).toBe(400);
    expect(await blogBatchStatus()).toBe('processing');
  });

  it('is refused through its own index, which the key is not for', async () => {
    expect((await status(blog, blogBatch, shopKey)).status).toBe(403);
  });
});

describe('a batch id that names no batch', () => {
  it('is not found when unknown', async () => {
    expect((await status(shop, crypto.randomUUID(), shopKey)).status).toBe(404);
  });

  it('is a bad request when not an id', async () => {
    expect((await status(shop, 'not-an-id', shopKey)).status).toBe(400);
  });
});

describe('an upload batch on its own index, with its key', () => {
  it('reports its progress', async () => {
    const res = await status(blog, blogBatch, blogKey);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ data: { batchId: blogBatch, status: 'processing' } });
  });

  it('is cancelled', async () => {
    expect((await cancel(blog, blogBatch, blogKey)).status).toBe(200);
    expect(await blogBatchStatus()).toBe('cancelled');
  });
});
