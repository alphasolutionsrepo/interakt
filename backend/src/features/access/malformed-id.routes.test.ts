/**
 * An admin route given an ID that isn't a UUID answers 400, as the routes that check their
 * IDs first do. It used to answer 500: Postgres refused to compare the value with the uuid
 * column. Real route, gate, service and repository on a real Postgres (PGlite); only the
 * session is stubbed.
 */

import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { ADMIN_ROLE_ID } from './permissions';

import * as roleRoute from '@/app/api/roles/[id]/route';
import * as experienceIndexRoute from '@/app/api/search-experiences/[id]/indexes/[indexId]/route';
import * as userRoute from '@/app/api/users/[id]/route';
import { user } from '@/db/schema/users.schema';
import { createAppTestDb, type AppTestDb } from '@/shared/test/app-test-db';

let testDb: AppTestDb;
let session: { user: { id: string } } | null = null;
vi.mock('@/db/index', () => ({ get db() { return testDb.db; } }));
vi.mock('@/features/auth/auth.api.handlers', () => ({ auth: async () => session }));

beforeAll(async () => {
  testDb = await createAppTestDb();
  const [admin] = await testDb.db.insert(user).values({ email: 'admin@x.test', roleId: ADMIN_ROLE_ID, isActive: true, firstName: 'Ada' }).returning();
  session = { user: { id: admin.id } };
}, 60_000);
afterAll(() => testDb.close());

type Route = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
async function call(fn: unknown, method: string, url: string, id: string | Record<string, string>, body?: unknown) {
  const req = new NextRequest(`http://localhost${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  const res = await (fn as Route)(req, { params: Promise.resolve(typeof id === 'string' ? { id } : id) });
  return { status: res.status, body: (await res.json()) as { error?: { code?: string; message?: string } | string; code?: string; message?: string } };
}

describe.each([
  ['PUT /api/roles/:id', () => call(roleRoute.PUT, 'PUT', '/api/roles/not-a-uuid', 'not-a-uuid', { description: 'x' })],
  ['DELETE /api/roles/:id', () => call(roleRoute.DELETE, 'DELETE', '/api/roles/not-a-uuid', 'not-a-uuid')],
  ['GET /api/users/:id', () => call(userRoute.GET, 'GET', '/api/users/not-a-uuid', 'not-a-uuid')],
  // A nested route, whose handler answers through apiResponse.error rather than a refusal of its own
  ['DELETE /api/search-experiences/:id/indexes/:indexId', () => call(experienceIndexRoute.DELETE, 'DELETE', '/api/search-experiences/not-a-uuid/indexes/not-a-uuid', { id: 'not-a-uuid', indexId: 'not-a-uuid' })],
])('%s with an ID that is not a UUID', (_name, run) => {
  it('answers 400 BAD_REQUEST without repeating the value', async () => {
    const { status, body } = await run();
    expect(status).toBe(400);
    expect(JSON.stringify(body)).toContain('BAD_REQUEST');
    expect(JSON.stringify(body)).toContain("That ID isn't valid.");
    expect(JSON.stringify(body)).not.toContain('not-a-uuid');
  });
});

describe('the same routes with a well-formed ID nobody holds', () => {
  it('still answer 404', async () => {
    const unknown = '99999999-9999-4999-8999-999999999999';
    expect((await call(roleRoute.DELETE, 'DELETE', `/api/roles/${unknown}`, unknown)).status).toBe(404);
    expect((await call(userRoute.GET, 'GET', `/api/users/${unknown}`, unknown)).status).toBe(404);
  });
});
