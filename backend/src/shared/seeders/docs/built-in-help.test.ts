// src/shared/seeders/docs/built-in-help.test.ts

/** Recognising the built-in help experiences, on the real seed registry table (PGlite). */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { SEED_TYPES } from '@/db/schema/seed-registry.schema';
import { createAppTestDb, type AppTestDb } from '@/shared/test/app-test-db';

let testDb: AppTestDb;
vi.mock('@/db/index', () => ({ get db() { return testDb.db; } }));

import { upsertRegistryEntry } from '../seed-registry.service';

import { isBuiltInHelpExperience, recordBuiltInExperience } from './built-in-help';

beforeAll(async () => { testDb = await createAppTestDb(); }, 60_000);
afterAll(() => testDb.close());

describe('the built-in help experiences', () => {
  it('are the experiences the docs setup recorded, by id; nothing before it ran', async () => {
    expect(await isBuiltInHelpExperience({ slug: 'interakt-docs', id: 'e1' })).toBe(false);

    await upsertRegistryEntry(SEED_TYPES.DOCS, 'interakt-docs-search', 'sum', { sections: 3 });
    // An entry written before ids were recorded trusts nothing until the id is backfilled
    expect(await isBuiltInHelpExperience({ slug: 'interakt-docs', id: 'e1' })).toBe(false);
    await recordBuiltInExperience('interakt-docs-search', 'e1', { onlyIfMissing: true });
    expect(await isBuiltInHelpExperience({ slug: 'interakt-docs', id: 'e1' })).toBe(true);

    // A later skip-path backfill can't replace the id it holds
    await recordBuiltInExperience('interakt-docs-search', 'lookalike', { onlyIfMissing: true });
    expect(await isBuiltInHelpExperience({ slug: 'interakt-docs', id: 'lookalike' })).toBe(false);
    expect(await isBuiltInHelpExperience({ slug: 'interakt-docs', id: 'e1' })).toBe(true);

    // A real re-run of the setup records its new experience
    await recordBuiltInExperience('interakt-docs-search', 'e2');
    expect(await isBuiltInHelpExperience({ slug: 'interakt-docs', id: 'e2' })).toBe(true);
  });

  it('keep the rest of the entry when recording the id', async () => {
    await upsertRegistryEntry(SEED_TYPES.DOCS, 'interakt-docs', 'sum2', { documents: 9 });
    await recordBuiltInExperience('interakt-docs', 'h1');
    const row = await testDb.db.query.seedRegistry.findFirst({ where: (t, { eq }) => eq(t.seedKey, 'interakt-docs') });
    expect(JSON.parse(row!.metadata!)).toEqual({ documents: 9, experienceId: 'h1' });
    expect(row!.checksum).toBe('sum2');
    expect(await isBuiltInHelpExperience({ slug: 'help-assistant', id: 'h1' })).toBe(true);
    expect(await isBuiltInHelpExperience({ slug: 'some-other', id: 'h1' })).toBe(false);
  });
});
