// src/features/access/built-in.flag.test.ts

/**
 * The admin's tool and index responses say a row is built in exactly when the routes refuse a
 * non-Admin's change: marked by the docs setup, or used by a built-in experience. Real database
 * (PGlite), real GET routes.
 */

import { sql } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createAppTestDb, type AppTestDb } from '@/shared/test/app-test-db';

let testDb: AppTestDb;
vi.mock('@/db/index', () => ({ get db() { return testDb.db; } }));
vi.mock('@/features/auth/auth.api.handlers', async () => (await import('@/shared/test/access-stub')).signedInAuth);
vi.mock('@/features/access/access.service', async () => (await import('@/shared/test/access-stub')).accessService);

import * as toolsList from '@/app/api/tools/route';
import * as toolOne from '@/app/api/tools/[id]/route';
import * as indexList from '@/app/api/search-indexes/route';
import * as indexAll from '@/app/api/search-indexes/all/route';
import * as indexOne from '@/app/api/search-indexes/[id]/route';
import * as searchList from '@/app/api/search-experiences/route';
import * as searchOne from '@/app/api/search-experiences/[id]/route';

import { builtInIds } from './built-in';

beforeAll(async () => { testDb = await createAppTestDb(); }, 60_000);
afterAll(() => testDb.close());

const U = '00000000-0000-4000-8000-0000000000aa';
const one = async (q: ReturnType<typeof sql>) => ((await testDb.db.execute(q)) as unknown as { rows: Array<{ id: string }> }).rows[0].id;
const tag = () => `f${Math.random().toString(36).slice(2, 8)}`;
const tool = (isBuiltIn = false) => { const t = tag(); return one(sql`INSERT INTO tools (name, slug, ai_description, is_built_in) VALUES (${t}, ${t}, 'd', ${isBuiltIn}) RETURNING id`); };
const index = (isBuiltIn = false) => { const t = tag(); return one(sql`INSERT INTO search_index (name, display_name, search_type, is_built_in) VALUES (${t}, ${t}, 'lexical', ${isBuiltIn}) RETURNING id`); };
const chat = (isBuiltIn: boolean) => { const t = tag(); return one(sql`INSERT INTO ai_experiences (name, slug, created_by, persona_config, session_config, access_config, observability_config, is_built_in) VALUES (${t}, ${t}, ${U}, '{}', '{}', '{}', '{}', ${isBuiltIn}) RETURNING id`); };
const search = (isBuiltIn: boolean) => { const t = tag(); return one(sql`INSERT INTO search_experiences (name, slug, search_config, ai_config, tools_config, created_by, is_built_in) VALUES (${t}, ${t}, '{}', '{}', '{}', ${U}, ${isBuiltIn}) RETURNING id`); };

describe('builtInIds', () => {
  it('finds tools marked built in or used by a built-in chat experience, and no others', async () => {
    const [marked, attached, elsewhere, plain] = [await tool(true), await tool(), await tool(), await tool()];
    await testDb.db.execute(sql`INSERT INTO ai_experience_tools (ai_experience_id, tool_id) VALUES (${await chat(true)}, ${attached})`);
    await testDb.db.execute(sql`INSERT INTO ai_experience_tools (ai_experience_id, tool_id) VALUES (${await chat(false)}, ${elsewhere})`);
    expect(await builtInIds('tool', [marked, attached, elsewhere, plain, 'not-a-uuid'])).toEqual(new Set([marked, attached]));
  });

  it('finds indexes marked built in or used by a built-in search experience', async () => {
    const [marked, attached, plain] = [await index(true), await index(), await index()];
    await testDb.db.execute(sql`INSERT INTO search_experience_indexes (search_experience_id, search_index_id) VALUES (${await search(true)}, ${attached})`);
    expect(await builtInIds('search-index', [marked, attached, plain])).toEqual(new Set([marked, attached]));
  });

  it('asks nothing of the database for no ids', async () => {
    expect(await builtInIds('tool', [])).toEqual(new Set());
  });
});

describe('the tool responses', () => {
  it('flag a tool the built-in help uses, in the list and on its own', async () => {
    const attached = await tool();
    await testDb.db.execute(sql`INSERT INTO ai_experience_tools (ai_experience_id, tool_id) VALUES (${await chat(true)}, ${attached})`);
    const plain = await tool();

    const one = await (toolOne.GET as unknown as (r: NextRequest, c: { params: Promise<{ id: string }> }) => Promise<Response>)(
      new NextRequest(`http://localhost/api/tools/${attached}`), { params: Promise.resolve({ id: attached }) });
    expect((await one.json()).data.isBuiltIn).toBe(true);

    const list = await (toolsList.GET as unknown as (r: NextRequest) => Promise<Response>)(new NextRequest('http://localhost/api/tools?pageSize=100'));
    const rows = (await list.json()).data as Array<{ id: string; isBuiltIn: boolean }>;
    expect(rows.find((r) => r.id === attached)?.isBuiltIn).toBe(true);
    expect(rows.find((r) => r.id === plain)?.isBuiltIn).toBe(false);
  });
});

describe('the index responses', () => {
  it('flag an index a built-in search experience uses, in the list, the picker list and on its own', async () => {
    const attached = await index();
    await testDb.db.execute(sql`INSERT INTO search_experience_indexes (search_experience_id, search_index_id) VALUES (${await search(true)}, ${attached})`);
    const plain = await index();

    const one = await (indexOne.GET as unknown as (r: NextRequest, c: { params: Promise<{ id: string }> }) => Promise<Response>)(
      new NextRequest(`http://localhost/api/search-indexes/${attached}`), { params: Promise.resolve({ id: attached }) });
    expect((await one.json()).data.isBuiltIn).toBe(true);

    const list = await (indexList.GET as unknown as (r: NextRequest) => Promise<Response>)(new NextRequest('http://localhost/api/search-indexes?pageSize=100'));
    const listed = (await list.json()).data.items as Array<{ id: string; isBuiltIn: boolean }>;
    expect(listed.find((r) => r.id === attached)?.isBuiltIn).toBe(true);
    expect(listed.find((r) => r.id === plain)?.isBuiltIn).toBe(false);

    const all = await (indexAll.GET as unknown as (r: NextRequest) => Promise<Response>)(new NextRequest('http://localhost/api/search-indexes/all'));
    const picked = (await all.json()).data as Array<{ id: string; isBuiltIn: boolean }>;
    expect(picked.find((r) => r.id === attached)?.isBuiltIn).toBe(true);
    expect(picked.find((r) => r.id === plain)?.isBuiltIn).toBe(false);
  });
});

describe('the search experience responses', () => {
  it('say which experience is the built-in help, in the list and on its own', async () => {
    const [builtIn, plain] = [await search(true), await search(false)];
    const get = (id: string) => (searchOne.GET as unknown as (r: NextRequest, c: { params: Promise<{ id: string }> }) => Promise<Response>)(
      new NextRequest(`http://localhost/api/search-experiences/${id}`), { params: Promise.resolve({ id }) });
    expect((await (await get(builtIn)).json()).data.isBuiltIn).toBe(true);
    expect((await (await get(plain)).json()).data.isBuiltIn).toBe(false);

    const list = await (searchList.GET as unknown as (r: NextRequest) => Promise<Response>)(new NextRequest('http://localhost/api/search-experiences?pageSize=100'));
    const body = (await list.json()).data;
    const rows = (Array.isArray(body) ? body : body.items) as Array<{ id: string; isBuiltIn: boolean }>;
    expect(rows.find((r) => r.id === builtIn)?.isBuiltIn).toBe(true);
    expect(rows.find((r) => r.id === plain)?.isBuiltIn).toBe(false);
  });
});
