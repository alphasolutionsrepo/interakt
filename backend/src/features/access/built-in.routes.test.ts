// src/features/access/built-in.routes.test.ts

/**
 * Only an Admin changes what the built-in help is made of (its experiences, the docs data
 * source and its tools, the docs search index), on the real routes, with the built-in mark read
 * from a real database (PGlite). The route handlers behind the gate are stubbed to record the
 * change; the role comes from the access stub.
 */

import { sql } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAppTestDb, type AppTestDb } from '@/shared/test/app-test-db';

let testDb: AppTestDb;
vi.mock('@/db/index', () => ({ get db() { return testDb.db; } }));
vi.mock('@/features/auth/auth.api.handlers', async () => (await import('@/shared/test/access-stub')).signedInAuth);
vi.mock('@/features/access/access.service', async () => (await import('@/shared/test/access-stub')).accessService);

const { changed, record } = vi.hoisted(() => {
  const changed: string[] = [];
  const record = (name: string) => async () => { changed.push(name); return Response.json({ success: true }); };
  return { changed, record };
});
vi.mock('@/features/ai-experience/ai-experience.api.handlers', () => ({
  handleUpdateAIExperience: record('chat:update'),
  handleDeleteAIExperience: record('chat:delete'),
  handleAssignTool: record('chat:tool'),
  handleRegenerateAccessToken: record('chat:token'),
}));
vi.mock('@/features/search-experience/search-experience.admin.handlers', () => ({
  handleAddIndex: record('search:index'),
}));
vi.mock('@/features/tools/tools.api.handlers', () => ({
  handleUpdateTool: record('tool:update'),
  handleDeleteTool: record('tool:delete'),
}));
vi.mock('@/features/data-source/data-source.api.handlers', () => ({
  handleUpdateDataSource: record('data-source:update'),
  handleDeleteDataSource: record('data-source:delete'),
}));
vi.mock('@/features/search-index/search-index.api.handlers', () => ({
  handleUpdateSearchIndex: record('index:update'),
  handleDeleteSearchIndex: record('index:delete'),
}));
vi.mock('@/features/document-indexing', () => ({
  handleIndexDocuments: record('index:documents'),
}));
vi.mock('@/features/knowledge-base/knowledge-base.service', () => ({
  uploadDocument: async () => { changed.push('kb:upload'); return { document: { id: 'd' }, chunkCount: 1, embeddedCount: 1 }; },
}));

import * as chatOne from '@/app/api/ai-experiences/[id]/route';
import * as chatToken from '@/app/api/ai-experiences/[id]/regenerate-token/route';
import * as chatTools from '@/app/api/ai-experiences/[id]/tools/route';
import * as dataSourceOne from '@/app/api/data-sources/[id]/route';
import * as kbUpload from '@/app/api/knowledge-base/upload/route';
import * as indexOne from '@/app/api/search-indexes/[id]/route';
import * as indexDocuments from '@/app/api/search-indexes/[id]/documents/route';
import * as searchIndexes from '@/app/api/search-experiences/[id]/indexes/route';
import * as toolOne from '@/app/api/tools/[id]/route';
import { accessStub } from '@/shared/test/access-stub';

import { BUILT_IN_REFUSAL, EDITOR_DEFAULT_PERMISSIONS } from './permissions';

beforeAll(async () => { testDb = await createAppTestDb(); }, 60_000);
afterAll(() => testDb.close());

const U = '00000000-0000-4000-8000-0000000000aa';
type Ids = { chat: string; search: string; tool: string; dataSource: string; index: string };
/** One of each kind, marked built in or not */
async function rows(isBuiltIn: boolean): Promise<Ids> {
  const tag = `${isBuiltIn ? 'b' : 'o'}${Math.random().toString(36).slice(2, 8)}`;
  const one = async (q: ReturnType<typeof sql>) => ((await testDb.db.execute(q)) as unknown as { rows: Array<{ id: string }> }).rows[0].id;
  return {
    chat: await one(sql`INSERT INTO ai_experiences (name, slug, created_by, persona_config, session_config, access_config, observability_config, is_built_in) VALUES (${tag}, ${tag}, ${U}, '{}', '{}', '{}', '{}', ${isBuiltIn}) RETURNING id`),
    search: await one(sql`INSERT INTO search_experiences (name, slug, search_config, ai_config, tools_config, created_by, is_built_in) VALUES (${tag}, ${tag}, '{}', '{}', '{}', ${U}, ${isBuiltIn}) RETURNING id`),
    tool: await one(sql`INSERT INTO tools (name, slug, ai_description, is_built_in) VALUES (${tag}, ${tag}, 'd', ${isBuiltIn}) RETURNING id`),
    dataSource: await one(sql`INSERT INTO data_sources (name, slug, type, config, is_built_in) VALUES (${tag}, ${tag}, 'file_store', '{}', ${isBuiltIn}) RETURNING id`),
    index: await one(sql`INSERT INTO search_index (name, display_name, search_type, is_built_in) VALUES (${tag}, ${tag}, 'lexical', ${isBuiltIn}) RETURNING id`),
  };
}

type Route = (r: NextRequest, c: { params: Promise<{ id: string }> }) => Promise<Response>;
const CHANGES: Array<[string, unknown, keyof Ids, string]> = [
  ['update a chat experience', chatOne.PUT, 'chat', 'chat:update'],
  ['delete a chat experience', chatOne.DELETE, 'chat', 'chat:delete'],
  ['regenerate a chat token', chatToken.POST, 'chat', 'chat:token'],
  ['attach a tool to a chat experience', chatTools.POST, 'chat', 'chat:tool'],
  ['add an index to a search experience', searchIndexes.POST, 'search', 'search:index'],
  ['update a tool', toolOne.PUT, 'tool', 'tool:update'],
  ['delete a tool', toolOne.DELETE, 'tool', 'tool:delete'],
  ['update a data source', dataSourceOne.PUT, 'dataSource', 'data-source:update'],
  ['delete a data source', dataSourceOne.DELETE, 'dataSource', 'data-source:delete'],
  ['update an index', indexOne.PUT, 'index', 'index:update'],
  ['delete an index', indexOne.DELETE, 'index', 'index:delete'],
  ['add documents to an index', indexDocuments.POST, 'index', 'index:documents'],
];
const call = (fn: unknown, id: string, headers: Record<string, string> = {}) =>
  (fn as Route)(new NextRequest('http://localhost/api/x', { method: 'POST', body: '{}', headers }), { params: Promise.resolve({ id }) });
const asEditor = () => {
  accessStub.access = { ...accessStub.access!, isAdmin: false, roleName: 'Editor', permissions: new Set(EDITOR_DEFAULT_PERMISSIONS) };
};

let builtIn: Ids, other: Ids;
beforeAll(async () => { builtIn = await rows(true); other = await rows(false); });
beforeEach(() => { changed.length = 0; });
afterEach(() => accessStub.reset());

describe('changing what the built-in help is made of', () => {
  it.each(CHANGES)('%s: an Editor is refused on the built-in one, before any change', async (_name, fn, kind) => {
    asEditor();
    const res = await call(fn, builtIn[kind]);
    expect(res.status).toBe(403);
    expect((await res.json()).message).toBe(BUILT_IN_REFUSAL);
    expect(changed).toEqual([]);
  });

  it.each(CHANGES)('%s: an Admin may change the built-in one', async (_name, fn, kind, change) => {
    expect((await call(fn, builtIn[kind])).status).toBe(200);
    expect(changed).toEqual([change]);
  });

  it.each(CHANGES)('%s: an Editor may change any other', async (_name, fn, kind, change) => {
    asEditor();
    expect((await call(fn, other[kind])).status).toBe(200);
    expect(changed).toEqual([change]);
  });

  it('treats a tool or index the built-in help uses as built in, though not marked (one an Admin attached)', async () => {
    const attached = await rows(false);
    await testDb.db.execute(sql`INSERT INTO ai_experience_tools (ai_experience_id, tool_id) VALUES (${builtIn.chat}, ${attached.tool})`);
    await testDb.db.execute(sql`INSERT INTO search_experience_indexes (search_experience_id, search_index_id) VALUES (${builtIn.search}, ${attached.index})`);
    asEditor();
    expect((await call(toolOne.PUT, attached.tool)).status).toBe(403);
    expect((await call(indexOne.PUT, attached.index)).status).toBe(403);
    expect(changed).toEqual([]);

    // Used only by an ordinary experience: an Editor may change it
    const usedElsewhere = await rows(false);
    await testDb.db.execute(sql`INSERT INTO ai_experience_tools (ai_experience_id, tool_id) VALUES (${other.chat}, ${usedElsewhere.tool})`);
    await testDb.db.execute(sql`INSERT INTO search_experience_indexes (search_experience_id, search_index_id) VALUES (${other.search}, ${usedElsewhere.index})`);
    expect((await call(toolOne.PUT, usedElsewhere.tool)).status).toBe(200);
    expect((await call(indexOne.PUT, usedElsewhere.index)).status).toBe(200);
  });

  it('refuses an ingestion key writing to the built-in docs index, and lets it write to others', async () => {
    accessStub.session = null;
    const key = { Authorization: 'Bearer ik_test' };
    expect((await call(indexDocuments.POST, builtIn.index, key)).status).toBe(403);
    expect(changed).toEqual([]);
    expect((await call(indexDocuments.POST, other.index, key)).status).toBe(200);
    expect(changed).toEqual(['index:documents']);
  });

  it("leaves an id that can't name a row to the route", async () => {
    asEditor();
    expect((await call(toolOne.PUT, 'not-a-uuid')).status).toBe(200);
  });

  it('refuses an Editor uploading to the docs data source through the knowledge base, not to others', async () => {
    asEditor();
    const upload = (dataSourceId: string) =>
      (kbUpload.POST as unknown as (r: NextRequest) => Promise<Response>)(new NextRequest('http://localhost/api/knowledge-base/upload', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataSourceId, name: 'a.md', content: 'x' }),
      }));
    expect((await upload(builtIn.dataSource)).status).toBe(403);
    expect(changed).toEqual([]);
    expect((await upload(other.dataSource)).status).toBe(201);
    expect(changed).toEqual(['kb:upload']);
  });

  it("refuses with an error, changing nothing, when it can't tell whether the row is built in", async () => {
    asEditor();
    const real = testDb.db.select;
    testDb.db.select = (() => { throw new Error('database down'); }) as never;
    try {
      expect((await call(chatOne.PUT, other.chat)).status).toBe(500);
    } finally {
      testDb.db.select = real;
    }
    expect(changed).toEqual([]);
  });
});
