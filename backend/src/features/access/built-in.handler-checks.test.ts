// src/features/access/built-in.handler-checks.test.ts

/**
 * The routes whose handler, not the route gate, refuses a non-Admin's change to the built-in
 * help (checksBuiltInInHandler in built-in.ts): adding a tool to the docs data source, making
 * tools from it, and deleting a document of its knowledge base. Real routes and handlers on a
 * real database (PGlite); only the session and the role are stubbed.
 *
 * access.routes.integration.test.ts covers the status codes; this pins the refusal itself: the
 * server's one sentence (the admin's locks show the same), nothing written, Admin let through.
 */

import { sql } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { BUILT_IN_REFUSAL, EDITOR_DEFAULT_PERMISSIONS } from './permissions';

import * as kbDocRoute from '@/app/api/knowledge-base/[id]/route';

let testDb: AppTestDb;
vi.mock('@/db/index', () => ({ get db() { return testDb.db; } }));
vi.mock('@/features/auth/auth.api.handlers', async () => (await import('@/shared/test/access-stub')).signedInAuth);
vi.mock('@/features/access/access.service', async () => (await import('@/shared/test/access-stub')).accessService);

import * as toolsRoute from '@/app/api/tools/route';
import * as scaffoldRoute from '@/app/api/tools/scaffold/route';
import { accessStub } from '@/shared/test/access-stub';
import { createAppTestDb, type AppTestDb } from '@/shared/test/app-test-db';


beforeAll(async () => { testDb = await createAppTestDb(); }, 60_000);
afterAll(() => testDb.close());
afterEach(() => accessStub.reset());

const asEditor = () => {
  accessStub.access = { ...accessStub.access!, isAdmin: false, roleName: 'Editor', permissions: new Set(EDITOR_DEFAULT_PERMISSIONS) };
};

const one = async (q: ReturnType<typeof sql>) => ((await testDb.db.execute(q)) as unknown as { rows: Array<Record<string, unknown>> }).rows[0];
const tag = () => `h${Math.random().toString(36).slice(2, 8)}`;
const dataSource = async (isBuiltIn: boolean) => {
  const t = tag();
  return (await one(sql`INSERT INTO data_sources (name, slug, type, config, is_built_in) VALUES (${t}, ${t}, 'file_store', '{}', ${isBuiltIn}) RETURNING id`)).id as string;
};
const kbDocument = async (dataSourceId: string) =>
  (await one(sql`INSERT INTO knowledge_documents (data_source_id, name) VALUES (${dataSourceId}, 'intro.md') RETURNING id`)).id as string;
const count = async (q: ReturnType<typeof sql>) => Number((await one(q)).n);
const toolsOn = (dataSourceId: string) => count(sql`SELECT count(*)::int AS n FROM tools WHERE data_source_id = ${dataSourceId}`);
const kbDocExists = async (id: string) => (await count(sql`SELECT count(*)::int AS n FROM knowledge_documents WHERE id = ${id}`)) === 1;

type Route = (r: NextRequest, c?: { params: Promise<{ id: string }> }) => Promise<Response>;
const post = (fn: unknown, url: string, body: unknown) =>
  (fn as Route)(new NextRequest(`http://localhost${url}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
const del = (fn: unknown, id: string) =>
  (fn as Route)(new NextRequest(`http://localhost/api/knowledge-base/${id}`, { method: 'DELETE' }), { params: Promise.resolve({ id }) });

/** The answer, read as the refusal or not */
const refusal = async (res: Response) => ({ status: res.status, message: ((await res.json().catch(() => ({}))) as { message?: string }).message });
const REFUSED = { status: 403, message: BUILT_IN_REFUSAL };

const newTool = (dataSourceId: string) => {
  const t = tag();
  return {
    name: t, slug: t, aiDescription: 'Looks things up over HTTP', executorType: 'http', dataSourceId,
    executorConfig: { baseUrl: 'https://api.example.test/x', method: 'GET', responseMapping: { resultsPath: '$.r' } },
  };
};

describe('a tool on the docs data source (POST /api/tools)', () => {
  it('is refused for an Editor with the server sentence, and nothing is written', async () => {
    const docs = await dataSource(true);
    asEditor();
    expect(await refusal(await post(toolsRoute.POST, '/api/tools', newTool(docs)))).toEqual(REFUSED);
    expect(await toolsOn(docs)).toBe(0);
  });

  it('is not refused for an Editor on another data source, nor for an Admin on the docs one', async () => {
    const other = await dataSource(false);
    asEditor();
    expect(await refusal(await post(toolsRoute.POST, '/api/tools', newTool(other)))).not.toEqual(REFUSED);
    accessStub.reset();
    expect(await refusal(await post(toolsRoute.POST, '/api/tools', newTool(await dataSource(true))))).not.toEqual(REFUSED);
  });
});

describe('tools made from the docs data source (POST /api/tools/scaffold)', () => {
  it('is refused for an Editor with the server sentence, and no tool is made', async () => {
    const docs = await dataSource(true);
    asEditor();
    expect(await refusal(await post(scaffoldRoute.POST, '/api/tools/scaffold', { dataSourceId: docs }))).toEqual(REFUSED);
    expect(await toolsOn(docs)).toBe(0);
  });

  it('is not refused for an Editor on another data source, nor for an Admin on the docs one', async () => {
    asEditor();
    expect(await refusal(await post(scaffoldRoute.POST, '/api/tools/scaffold', { dataSourceId: await dataSource(false) }))).not.toEqual(REFUSED);
    accessStub.reset();
    expect(await refusal(await post(scaffoldRoute.POST, '/api/tools/scaffold', { dataSourceId: await dataSource(true) }))).not.toEqual(REFUSED);
  });
});

describe("a document of the docs data source's knowledge base (DELETE /api/knowledge-base/[id])", () => {
  it('is refused for an Editor with the server sentence, and the document stays', async () => {
    const doc = await kbDocument(await dataSource(true));
    asEditor();
    expect(await refusal(await del(kbDocRoute.DELETE, doc))).toEqual(REFUSED);
    expect(await kbDocExists(doc)).toBe(true);
  });

  it("is deleted for an Editor on another data source's, and for an Admin on the docs one", async () => {
    const mine = await kbDocument(await dataSource(false));
    asEditor();
    expect((await del(kbDocRoute.DELETE, mine)).status).toBe(200);
    expect(await kbDocExists(mine)).toBe(false);
    accessStub.reset();
    const docs = await kbDocument(await dataSource(true));
    expect((await del(kbDocRoute.DELETE, docs)).status).toBe(200);
    expect(await kbDocExists(docs)).toBe(false);
  });
});
