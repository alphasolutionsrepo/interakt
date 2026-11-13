// src/features/global-settings/global-settings.feature-switches.test.ts

/**
 * The stored feature switches on a real Postgres (PGlite, all migrations): code that runs
 * before its migration, two saves at once, who is recorded, and the shared settings save.
 */

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { getGlobalSettings, getStoredFeaturesOff, invalidateCache, updateFeaturesOff, updateGlobalSettings } from './global-settings.service';

import { globalSearchSettings } from '@/db/schema/global-search-settings.schema';
import { clearFeatureSwitchCache, setFeatureSwitches } from '@/features/feature-switches/feature-switches.service';
import { AppError } from '@/shared/errors/app-error';
import { createAppTestDb, type AppTestDb } from '@/shared/test/app-test-db';
import type { LogLine } from '@/shared/test/log-recorder';

const logs = vi.hoisted(() => [] as LogLine[]);
let testDb: AppTestDb;

vi.mock('@/db/index', () => ({ get db() { return testDb.db; } }));
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));

beforeAll(async () => { testDb = await createAppTestDb(); }, 60_000);
afterAll(async () => { await testDb.close(); });
beforeEach(async () => {
  logs.length = 0;
  delete process.env.INTERAKT_FEATURES_OFF;
  clearFeatureSwitchCache();
  await testDb.db.delete(globalSearchSettings);
});

const stored = async () => (await testDb.db.select().from(globalSearchSettings))[0]?.featuresOff;

describe('saving feature switches', () => {
  it('keeps both changes when two Admins save at once', async () => {
    await testDb.db.insert(globalSearchSettings).values({});
    await Promise.all([
      setFeatureSwitches({ chat: false }, 'admin-1'),
      setFeatureSwitches({ analytics: false }, 'admin-2'),
    ]);
    expect(new Set(await stored())).toEqual(new Set(['chat', 'analytics']));
  });

  it('creates the settings row once when the first two saves are at the same time', async () => {
    await Promise.all([
      setFeatureSwitches({ chat: false }, 'admin-1'),
      setFeatureSwitches({ analytics: false }, 'admin-2'),
    ]);
    expect(await testDb.db.select().from(globalSearchSettings)).toHaveLength(1);
    expect(new Set(await stored())).toEqual(new Set(['chat', 'analytics']));
  });

  it('records who switched which areas', async () => {
    await setFeatureSwitches({ chat: false, analytics: true }, 'admin-7');
    expect(logs.find((l) => l.message === 'Feature switches changed')).toMatchObject({
      level: 'info',
      context: { userId: 'admin-7', switchedOff: ['chat'], switchedOn: ['analytics'] },
    });
  });
});

describe('the settings row', () => {
  it('is created with defaults and then updated by the general settings save', async () => {
    const created = await updateGlobalSettings({ searchTimeout: 1234 });
    expect(created).toMatchObject({ searchTimeout: 1234 });
    expect(await stored()).toEqual([]);
    const updated = await updateGlobalSettings({ rrfWindowSize: 77 });
    expect(updated).toMatchObject({ id: created.id, searchTimeout: 1234, rrfWindowSize: 77 });
    expect(await testDb.db.select().from(globalSearchSettings)).toHaveLength(1);
  });

  it('is shared with the feature switches save, which keeps the other settings', async () => {
    const created = await updateGlobalSettings({ searchTimeout: 1234 });
    await updateFeaturesOff(() => ['chat']);
    expect(await testDb.db.select().from(globalSearchSettings)).toMatchObject([{ id: created.id, searchTimeout: 1234, featuresOff: ['chat'] }]);
  });
});

describe('code deployed before its migration', () => {
  beforeAll(async () => {
    // A fresh database dropped back to how it was before the migration
    await testDb.db.execute(sql`ALTER TABLE global_search_settings DROP COLUMN features_off`);
  });

  it('reads nothing switched off, and warns once', async () => {
    expect(await getStoredFeaturesOff()).toEqual([]);
    expect(await getStoredFeaturesOff()).toEqual([]);
    const warnings = logs.filter((l) => l.level === 'warn');
    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toMatch(/migration.*has not run/);
  });

  it('reads the stored general settings, without errors', async () => {
    await testDb.db.execute(sql`INSERT INTO global_search_settings (search_timeout) VALUES (1234)`);
    invalidateCache();
    expect(await getGlobalSettings()).toMatchObject({ searchTimeout: 1234 });
    expect(logs.filter((l) => l.level === 'error')).toEqual([]);
  });

  it('saves the general settings', async () => {
    const created = await updateGlobalSettings({ searchTimeout: 1234 });
    expect(created).toMatchObject({ searchTimeout: 1234 });
    const updated = await updateGlobalSettings({ rrfWindowSize: 77 });
    expect(updated).toMatchObject({ id: created.id, searchTimeout: 1234, rrfWindowSize: 77 });
    invalidateCache();
    expect(await getGlobalSettings()).toMatchObject({ searchTimeout: 1234, rrfWindowSize: 77 });
  });

  it('refuses a save with a clear 503', async () => {
    const error = await setFeatureSwitches({ chat: false }, 'admin-1').catch((e) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ status: 503, code: 'DATABASE_UPDATE_PENDING' });
    expect(error.message).toMatch(/hasn't run yet/);
  });
});
