// src/features/access/built-in.create.test.ts

/**
 * The docs setup creates the help experiences built in from their first write, so no failure
 * between a create and a later mark can leave one unmarked (Viewers refused by Help, and every
 * later setup stopped by "already exists"). Real services on a real database (PGlite); anything
 * else creates ordinary rows.
 */

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createAIExperience } from '@/features/ai-experience/ai-experience.service';
import { createSearchExperience } from '@/features/search-experience/search-experience.service';
import { createAppTestDb, type AppTestDb } from '@/shared/test/app-test-db';

let testDb: AppTestDb;
vi.mock('@/db/index', () => ({ get db() { return testDb.db; } }));

beforeAll(async () => { testDb = await createAppTestDb(); }, 60_000);
afterAll(() => testDb.close());

const U = '00000000-0000-4000-8000-0000000000bb';
const tag = () => `c${Math.random().toString(36).slice(2, 8)}`;
const builtInOf = async (table: 'ai_experiences' | 'search_experiences', id: string) =>
  ((await testDb.db.execute(sql`SELECT is_built_in FROM ${sql.raw(table)} WHERE id = ${id}`)) as unknown as { rows: Array<{ is_built_in: boolean }> }).rows[0].is_built_in;

const chatInput = () => {
  const t = tag();
  return { name: t, slug: t, personaConfig: {}, sessionConfig: {}, accessConfig: {}, observabilityConfig: {} } as unknown as Parameters<typeof createAIExperience>[0];
};

const searchInput = async () => {
  const t = tag();
  const indexId = ((await testDb.db.execute(sql`INSERT INTO search_index (name, display_name, search_type) VALUES (${t}, ${t}, 'lexical') RETURNING id`)) as unknown as { rows: Array<{ id: string }> }).rows[0].id;
  return {
    name: t,
    slug: t,
    indexes: [{ searchIndexId: indexId, role: 'primary', weight: 1, sortOrder: 0 }],
    allowedOrigins: [],
    externalSources: [],
  } as unknown as Parameters<typeof createSearchExperience>[0];
};

describe('creating an experience as the built-in help', () => {
  it('writes a chat experience built in when asked, ordinary otherwise', async () => {
    const help = await createAIExperience(chatInput(), U, { builtIn: true });
    const plain = await createAIExperience(chatInput(), U);
    expect(await builtInOf('ai_experiences', help.id)).toBe(true);
    expect(await builtInOf('ai_experiences', plain.id)).toBe(false);
  });

  it('writes a search experience built in when asked, ordinary otherwise', async () => {
    const help = await createSearchExperience(await searchInput(), U, { builtIn: true });
    const plain = await createSearchExperience(await searchInput(), U);
    expect(await builtInOf('search_experiences', help.id)).toBe(true);
    expect(await builtInOf('search_experiences', plain.id)).toBe(false);
  });
});
