// src/shared/api/rate-limit.routes.integration.test.ts

/**
 * How rate-limited routes count, through the real routes and access checks on a real Postgres
 * (PGlite, all migrations); only the session is stubbed:
 *  - a route with a data source in its path counts each data source apart;
 *  - the span and trace routes have none, so each route is one count per caller, whatever span
 *    or trace id is asked for.
 * The document routes are covered in ingestion-key.rate-limit.integration.test.ts.
 */

import { randomUUID } from 'node:crypto';

import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const signedIn = vi.hoisted(() => ({ session: null as { user: { id: string } } | null }));
let testDb: AppTestDb;
vi.mock('@/db/index', () => ({ get db() { return testDb.db; } }));
vi.mock('@/features/auth/auth.api.handlers', () => ({ auth: async () => signedIn.session }));

import * as healthRoute from '@/app/api/data-sources/[id]/health/route';
import * as spanRoute from '@/app/api/telemetry/traces/[spanId]/route';
import * as tracesRoute from '@/app/api/telemetry/traces/route';
import * as traceRoute from '@/app/api/telemetry/traces/trace/[traceId]/route';
import { user } from '@/db/schema/users.schema';
import { ADMIN_ROLE_ID } from '@/features/access/permissions';
import { rateLimiter } from '@/shared/api/rate-limit';
import { createAppTestDb, type AppTestDb } from '@/shared/test/app-test-db';

type Route = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

beforeAll(async () => {
  testDb = await createAppTestDb();
  const [admin] = await testDb.db.insert(user).values({ email: 'telemetry-rl@x.test', roleId: ADMIN_ROLE_ID, isActive: true, firstName: 'A' }).returning();
  signedIn.session = { user: { id: admin.id } };
}, 60_000);
afterAll(async () => { await testDb.close(); });
beforeEach(() => rateLimiter.clear());

// Unknown ids are refused by the handler (400 or 404), after the rate limit has counted them
const paths = new Map<unknown, (id: string) => string>([
  [spanRoute.GET, (id) => `/api/telemetry/traces/${id}`],
  [spanRoute.DELETE, (id) => `/api/telemetry/traces/${id}`],
  [traceRoute.GET, (id) => `/api/telemetry/traces/trace/${id}`],
  [tracesRoute.GET, () => '/api/telemetry/traces'],
  [healthRoute.POST, (id) => `/api/data-sources/${id}/health`],
]);
const call = (route: unknown, method: string, params: Record<string, string>) =>
  (route as Route)(
    new NextRequest(`http://localhost${paths.get(route)!(Object.values(params)[0])}`, { method, headers: { 'X-Forwarded-For': '7.7.7.1' } }),
    { params: Promise.resolve(params) },
  );

describe('span and trace routes', () => {
  it('count deleting spans once for the route (10 a minute), whatever span is deleted', async () => {
    for (let i = 0; i < 10; i++) expect((await call(spanRoute.DELETE, 'DELETE', { spanId: `span-${i}` })).status).toBe(400);
    expect((await call(spanRoute.DELETE, 'DELETE', { spanId: randomUUID() })).status).toBe(429);
  });

  it('count reading spans and reading traces apart, each once for the route (60 a minute)', async () => {
    for (let i = 0; i < 60; i++) expect((await call(spanRoute.GET, 'GET', { spanId: `span-${i}` })).status).toBe(400);
    expect((await call(spanRoute.GET, 'GET', { spanId: 'span-60' })).status).toBe(429);
    expect((await call(traceRoute.GET, 'GET', { traceId: 'trace-0' })).status).not.toBe(429);
  });
});

describe('the data-source health check', () => {
  it('counts each data source apart (6 a minute each)', async () => {
    const [a, b] = [randomUUID(), randomUUID()];
    for (let i = 0; i < 6; i++) expect((await call(healthRoute.POST, 'POST', { id: a })).status).toBe(404);
    expect((await call(healthRoute.POST, 'POST', { id: a })).status).toBe(429);
    expect((await call(healthRoute.POST, 'POST', { id: b })).status).toBe(404);
  });
});

describe('the span list', () => {
  it('counts once per route (60 a minute)', async () => {
    for (let i = 0; i < 60; i++) expect((await call(tracesRoute.GET, 'GET', {})).status).not.toBe(429);
    expect((await call(tracesRoute.GET, 'GET', {})).status).toBe(429);
  });
});
