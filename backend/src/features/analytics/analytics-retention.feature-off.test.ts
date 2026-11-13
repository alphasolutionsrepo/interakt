// src/features/analytics/analytics-retention.feature-off.test.ts

/**
 * The retention cleanup keeps its schedule whatever the Analytics switch says: with Analytics off
 * nothing new is recorded, but data past its retention period is still deleted (privacy: switching
 * collection off must not keep old visitor data longer). Real Postgres (PGlite with the analytics
 * migrations); the switch is the shared stub.
 */

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAnalyticsTestDb, type AnalyticsTestDb } from '@/shared/test/analytics-test-db';

let testDb: AnalyticsTestDb;
// The cleanup reads the delete count and table check the way postgres-js returns them (an array
// with .count); PGlite returns { rows, affectedRows }, so adapt it.
vi.mock('@/db/index', () => ({
  get analyticsDB() {
    return {
      execute: async (query: never) => {
        const res = await testDb.db.execute(query);
        return Object.assign([...res.rows], { count: res.affectedRows ?? res.rows.length });
      },
    };
  },
  db: {},
}));
vi.mock('@/features/feature-switches/feature-switches.service', async () => (await import('@/shared/test/feature-switches-stub')).featureSwitchesService);

import { featureSwitchesService, featureSwitchesStub } from '@/shared/test/feature-switches-stub';

import { runRetentionCleanup } from './analytics-retention';

/** provider_health keeps 30 days; one row is well past that, one is fresh. */
async function insertRows() {
  for (const daysAgo of [400, 0]) {
    await testDb.db.execute(sql`
      INSERT INTO provider_health (provider_id, provider_key, window_start, window_end)
      VALUES (${crypto.randomUUID()}, 'ollama',
        now() - make_interval(days => ${daysAgo}), now() - make_interval(days => ${daysAgo}))
    `);
  }
}

async function rowCount(): Promise<number> {
  const res = await testDb.db.execute(sql`SELECT count(*)::int AS n FROM provider_health`);
  return (res.rows[0] as { n: number }).n;
}

beforeAll(async () => {
  testDb = await createAnalyticsTestDb();
});
beforeEach(async () => {
  featureSwitchesStub.reset();
  vi.restoreAllMocks();
  await testDb.reset();
});
afterAll(async () => {
  await testDb.close();
});

describe('analytics retention cleanup and the Analytics switch', () => {
  it('deletes rows past their retention while the Analytics area is off', async () => {
    await insertRows();
    featureSwitchesStub.off.add('analytics');
    await runRetentionCleanup();
    expect(await rowCount()).toBe(1);
  });

  it('deletes rows past their retention with Analytics on', async () => {
    await insertRows();
    await runRetentionCleanup();
    expect(await rowCount()).toBe(1);
  });

  it('never reads the switches during a run (on or off), so the schedule cannot depend on them', async () => {
    await insertRows();
    const spies = Object.entries(featureSwitchesService)
      .filter(([, fn]) => typeof fn === 'function')
      .map(([name]) => vi.spyOn(featureSwitchesService as never, name as never));
    expect(spies.length).toBeGreaterThan(0);
    for (const off of [true, false]) {
      if (off) featureSwitchesStub.off.add('analytics'); else featureSwitchesStub.off.clear();
      await runRetentionCleanup();
    }
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});
