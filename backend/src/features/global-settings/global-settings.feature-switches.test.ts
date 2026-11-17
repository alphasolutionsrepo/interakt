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

  it('is the oldest one when there are two', async () => {
    const [older] = await testDb.db.insert(globalSearchSettings).values({ searchTimeout: 1111, createdAt: new Date('2026-01-01') }).returning();
    await testDb.db.insert(globalSearchSettings).values({ searchTimeout: 2222, createdAt: new Date('2026-06-01') });
    invalidateCache();
    expect(await getGlobalSettings()).toMatchObject({ id: older.id, searchTimeout: 1111 });
    await updateFeaturesOff(() => ['chat']);
    expect(await getStoredFeaturesOff()).toEqual(['chat']);
    expect((await updateGlobalSettings({ rrfWindowSize: 77 })).id).toBe(older.id);
  });

  it('is shared with the feature switches save, which keeps the other settings', async () => {
    const created = await updateGlobalSettings({ searchTimeout: 1234 });
    await updateFeaturesOff(() => ['chat']);
    expect(await testDb.db.select().from(globalSearchSettings)).toMatchObject([{ id: created.id, searchTimeout: 1234, featuresOff: ['chat'] }]);
  });
});

describe('every write to the settings row', () => {
  // The database refuses a write made without the save lock held, so each save is checked to
  // look up (or create) the row and change it under the lock. PGlite runs one query at a time,
  // so two saves at once can't show a missing lock; this can.
  beforeAll(async () => {
    await testDb.db.execute(sql`
      CREATE FUNCTION require_settings_lock() RETURNS trigger AS $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND objid = 4071113 AND granted AND pid = pg_backend_pid()) THEN
          RAISE EXCEPTION 'settings written without the save lock';
        END IF;
        RETURN NEW;
      END $$ LANGUAGE plpgsql`);
    await testDb.db.execute(sql`CREATE TRIGGER require_settings_lock BEFORE INSERT OR UPDATE ON global_search_settings FOR EACH ROW EXECUTE FUNCTION require_settings_lock()`);
  });
  afterAll(async () => {
    await testDb.db.execute(sql`DROP TRIGGER require_settings_lock ON global_search_settings`);
    await testDb.db.execute(sql`DROP FUNCTION require_settings_lock()`);
  });

  it('holds the lock in the general settings save, creating the row and then updating it', async () => {
    const created = await updateGlobalSettings({ searchTimeout: 1234 });
    expect((await updateGlobalSettings({ rrfWindowSize: 77 })).id).toBe(created.id);
  });

  it('holds the lock in the feature switches save, creating the row and then updating it', async () => {
    await setFeatureSwitches({ chat: false }, 'admin-1');
    await setFeatureSwitches({ analytics: false }, 'admin-1');
    expect(new Set(await stored())).toEqual(new Set(['chat', 'analytics']));
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
