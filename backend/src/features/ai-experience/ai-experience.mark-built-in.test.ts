// src/features/ai-experience/ai-experience.mark-built-in.test.ts

/**
 * Marking an experience built in must reach the by-slug read the Help route makes: that read is
 * cached, and a stale row would keep refusing Viewers. Real service and database (PGlite).
 */

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { getAIExperienceBySlug, markAIExperienceBuiltIn } from './ai-experience.service';

import { createAppTestDb, type AppTestDb } from '@/shared/test/app-test-db';

let testDb: AppTestDb;
vi.mock('@/db/index', () => ({ get db() { return testDb.db; } }));

beforeAll(async () => {
  testDb = await createAppTestDb();
  await testDb.db.execute(sql`INSERT INTO ai_experiences (name, slug, created_by, persona_config, session_config, access_config, observability_config) VALUES ('Help', 'help-assistant', '00000000-0000-4000-8000-0000000000aa', '{}', '{}', '{}', '{}')`);
}, 60_000);
afterAll(() => testDb.close());

describe('markAIExperienceBuiltIn', () => {
  it('is seen by the next by-slug read, even when an earlier read cached the unmarked row', async () => {
    expect((await getAIExperienceBySlug('help-assistant'))?.isBuiltIn).toBe(false);
    const id = (await getAIExperienceBySlug('help-assistant'))!.id;

    await markAIExperienceBuiltIn(id);

    expect((await getAIExperienceBySlug('help-assistant'))?.isBuiltIn).toBe(true);
  });
});
