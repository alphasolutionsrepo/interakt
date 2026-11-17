// src/features/document-indexing/document-indexing.batch-scope.handler.test.ts

/**
 * An upload batch is read and cancelled through its own index only: a caller with access to
 * one index gets "not found" for another index's batch, and that batch keeps running. The real
 * handlers and batch queries run on an in-memory Postgres; only the caller's access is faked
 * (allowed on the index in the URL).
 */

import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { indexingBatches, searchIndex } from '../../../db/schema';

import { createAppTestDb, type AppTestDb } from '@/shared/test/app-test-db';

let testDb: AppTestDb;
vi.mock('@/db/index', () => ({ get db() { return testDb.db; } }));
vi.mock('server-only', () => ({}));
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger([]));
vi.mock('./document-actor', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./document-actor')>()),
  resolveDocumentActor: async () => ({ actor: { kind: 'user', userId: 'u1' } }),
}));

import { handleCancelBatch, handleGetBatchStatus } from './document-indexing.api.handlers';

let shop: string;
let blog: string;
let blogBatch: string;

beforeAll(async () => {
  testDb = await createAppTestDb();
  [{ id: shop }, { id: blog }] = await testDb.db.insert(searchIndex).values([
    { name: 'shop', displayName: 'Shop', searchType: 'lexical' },
    { name: 'blog', displayName: 'Blog', searchType: 'lexical' },
  ]).returning();
  [{ id: blogBatch }] = await testDb.db.insert(indexingBatches)
    .values({ searchIndexId: blog, status: 'processing', totalDocuments: 10, startedAt: new Date() })
    .returning();
}, 30_000);

afterAll(() => testDb.close());

const url = (indexId: string, batchId: string) => `http://localhost/api/search-indexes/${indexId}/documents/batches/${batchId}`;
const params = (id: string, batchId: string) => ({ params: Promise.resolve({ id, batchId }) });
const status = (indexId: string, batchId: string) => handleGetBatchStatus(new NextRequest(url(indexId, batchId)), params(indexId, batchId));
const cancel = (indexId: string, batchId: string) =>
  handleCancelBatch(new NextRequest(url(indexId, batchId), { method: 'DELETE' }), params(indexId, batchId));
const batchStatus = async () =>
  (await testDb.db.select({ status: indexingBatches.status }).from(indexingBatches).where(eq(indexingBatches.id, blogBatch)))[0].status;

describe("another index's upload batch", () => {
  it('is not found through an index it does not belong to', async () => {
    expect((await status(shop, blogBatch)).status).toBe(404);
  });

  it('is not cancelled through an index it does not belong to, and keeps running', async () => {
    expect((await cancel(shop, blogBatch)).status).toBe(400);
    expect(await batchStatus()).toBe('processing');
  });
});

describe('an upload batch on its own index', () => {
  it('reports its progress', async () => {
    const res = await status(blog, blogBatch);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ data: { batchId: blogBatch, status: 'processing' } });
  });

  it('is cancelled', async () => {
    expect((await cancel(blog, blogBatch)).status).toBe(200);
    expect(await batchStatus()).toBe('cancelled');
  });
});
