// src/features/dashboard/home.service.health.test.ts

/**
 * The home page's health tasks through the path production runs: the health check's stored
 * output is read from the jobs table (pgboss.job) and ends up in the home payload's tasks.
 * Real Postgres (PGlite) with the job table created; the payload is built by getHomeData.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

let testDb: AppTestDb;
// The page imports the database module in several reads at once, and vitest hands the real module
// (not a mock of it) to all but the first of concurrent imports of a mocked module. So the module
// stays real and its connection is what is replaced: drizzle(postgres(...)) gives the PGlite
// database. The jobs table is read through db.execute, which gives rows as a list in production.
vi.mock('postgres', () => ({ default: () => ({}) }));
vi.mock('drizzle-orm/postgres-js', () => ({
  drizzle: () =>
    new Proxy({}, {
      get: (_target, key) =>
        key === 'execute'
          ? async (query: Parameters<AppTestDb['db']['execute']>[0]) => (await testDb.db.execute(query)).rows
          : Reflect.get(testDb.db, key),
    }),
}));
vi.mock('@/features/analytics/analytics-insights.service', () => ({
  getProactiveInsights: vi.fn(),
  getStoredInsight: vi.fn(),
  listDismissedTips: vi.fn().mockResolvedValue(new Set()),
}));

import { getHomeData, invalidateHomeCache } from './home.service';

import { createAppTestDb, type AppTestDb } from '@/shared/test/app-test-db';

beforeAll(async () => {
  testDb = await createAppTestDb();
  await testDb.db.execute('CREATE SCHEMA IF NOT EXISTS pgboss');
  await testDb.db.execute(`
    CREATE TABLE pgboss.job (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL,
      state text NOT NULL,
      output jsonb,
      completed_on timestamptz
    )
  `);
}, 60_000);
afterAll(() => testDb.close());

beforeEach(async () => {
  invalidateHomeCache();
  await testDb.db.execute('DELETE FROM pgboss.job');
});

const storeHealthCheck = (output: unknown) =>
  testDb.db.execute(`INSERT INTO pgboss.job (name, state, output, completed_on) VALUES ('health-check', 'completed', '${JSON.stringify(output)}'::jsonb, now())`);

describe('home page health tasks, from the stored health check', { timeout: 30_000 }, () => {
  it("lists a degraded Client addresses service by the check's own task, linking to the health page", async () => {
    await storeHealthCheck({
      status: 'degraded',
      checkedAt: new Date().toISOString(),
      services: [
        { name: 'Database (PostgreSQL)', status: 'healthy', message: 'Query time: 2ms' },
        { name: 'Client addresses', status: 'degraded', message: 'm', task: 'Check how client addresses are read' },
      ],
    });

    const home = await getHomeData('UTC', false);

    expect(home.health?.problems).toEqual([
      { name: 'Client addresses', status: 'degraded', message: 'm', task: 'Check how client addresses are read' },
    ]);
    expect(home.tasks).toContainEqual({
      id: 'health:Client addresses',
      label: 'Check how client addresses are read',
      count: 1,
      href: '/health',
      tone: 'warning',
    });
  });

  it('has no health task when the stored check found every service healthy', async () => {
    await storeHealthCheck({
      status: 'healthy',
      checkedAt: new Date().toISOString(),
      services: [{ name: 'Client addresses', status: 'healthy', message: 'ok' }],
    });

    const home = await getHomeData('UTC', false);

    expect(home.tasks.filter((t) => t.id.startsWith('health:'))).toEqual([]);
  });
});
