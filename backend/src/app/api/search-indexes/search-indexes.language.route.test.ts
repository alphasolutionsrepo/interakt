// src/app/api/search-indexes/search-indexes.language.route.test.ts

/**
 * An index language the engine can't use, and custom stop words on Azure, are refused by
 * the real create and update routes with a 400 that says why; the valid cases are saved.
 * Real routes, real search index service, real database (PGlite). Nothing here reaches a
 * search engine: an index record is created without its engine index.
 */

import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import * as indexRoute from '@/app/api/search-indexes/[id]/route';
import * as importRoute from '@/app/api/search-indexes/import/route';
import * as indexesRoute from '@/app/api/search-indexes/route';
import { searchIndex } from '@/db/schema';
import { user } from '@/db/schema/users.schema';
import { ADMIN_ROLE_ID } from '@/features/access/permissions';
import type { UserAccess } from '@/features/access/user-access';
import { accessStub } from '@/shared/test/access-stub';
import { createAppTestDb, type AppTestDb } from '@/shared/test/app-test-db';

let testDb: AppTestDb;
const engine = vi.hoisted(() => ({ provider: 'elasticsearch' }));
// The import creates its index on the deployment's engine; the test picks it
vi.mock('@/config/search-provider.config', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  get selectedSearchProvider() { return engine.provider; },
}));
vi.mock('@/db/index', () => ({ get db() { return testDb.db; } }));
vi.mock('@/features/auth/auth.api.handlers', async () => (await import('@/shared/test/access-stub')).signedInAuth);
vi.mock('@/features/access/access.service', async () => (await import('@/shared/test/access-stub')).accessService);

beforeAll(async () => {
  testDb = await createAppTestDb();
  const [admin] = await testDb.db.insert(user).values({ email: 'admin@x.test', roleId: ADMIN_ROLE_ID, isActive: true, firstName: 'Admin' }).returning();
  accessStub.session = { user: { id: admin.id } };
}, 60_000);
afterAll(() => { accessStub.reset(); return testDb.close(); });

let counter = 0;
const nextName = () => `idx${++counter}`;

async function create(body: Record<string, unknown>) {
  const name = nextName();
  const res = await indexesRoute.POST(new NextRequest('http://localhost/api/search-indexes', {
    method: 'POST',
    body: JSON.stringify({ name, displayName: name, searchType: 'lexical', ...body }),
  }));
  return { status: res.status, body: await res.json(), name };
}

async function update(id: string, body: Record<string, unknown>) {
  const res = await indexRoute.PUT(
    new NextRequest(`http://localhost/api/search-indexes/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    { params: Promise.resolve({ id }) },
  );
  return { status: res.status, body: await res.json() };
}

const stored = async (id: string) => (await testDb.db.select().from(searchIndex).where(eq(searchIndex.id, id)))[0];

describe('creating an index', () => {
  it('refuses a language the engine lacks, naming the language and the engine', async () => {
    const { status, body } = await create({ searchProvider: 'azure-ai-search', language: 'cjk' });
    expect(status).toBe(400);
    expect(JSON.stringify(body)).toContain("Language 'cjk' isn't available for Azure AI Search");
  });

  it('takes Danish on Azure and the same language CJK on Elasticsearch', async () => {
    const azure = await create({ searchProvider: 'azure-ai-search', language: 'danish' });
    expect(azure.status).toBe(201);
    expect((await stored(azure.body.data?.id ?? azure.body.id)).language).toBe('danish');
    expect((await create({ searchProvider: 'elasticsearch', language: 'cjk' })).status).toBe(201);
  });

  it('refuses custom stop words on Azure and takes them on Elasticsearch', async () => {
    const refused = await create({ searchProvider: 'azure-ai-search', stopWords: ['the'] });
    expect(refused.status).toBe(400);
    expect(JSON.stringify(refused.body)).toContain("Custom stop words can't be applied on Azure AI Search");
    expect((await create({ searchProvider: 'elasticsearch', stopWords: ['the'] })).status).toBe(201);
  });
});

describe('updating an index', () => {
  const idOf = (r: { body: { data?: { id: string }; id?: string } }) => (r.body.data?.id ?? r.body.id) as string;

  it('refuses changing to a language the engine lacks, and keeps the old one', async () => {
    const id = idOf(await create({ searchProvider: 'azure-ai-search', language: 'danish' }));
    const { status, body } = await update(id, { language: 'cjk' });
    expect(status).toBe(400);
    expect(JSON.stringify(body)).toContain("Language 'cjk' isn't available for Azure AI Search");
    expect((await stored(id)).language).toBe('danish');
  });

  it('accepts changing to Norwegian', async () => {
    const id = idOf(await create({ searchProvider: 'azure-ai-search', language: 'danish' }));
    expect((await update(id, { language: 'norwegian' })).status).toBe(200);
    expect((await stored(id)).language).toBe('norwegian');
  });
});

describe('updating stop words on an Azure index', () => {
  const idOf = (r: { body: { data?: { id: string }; id?: string } }) => (r.body.data?.id ?? r.body.id) as string;

  it('refuses adding a word and keeps the stored list', async () => {
    const id = idOf(await create({ searchProvider: 'elasticsearch', stopWords: ['a', 'the'] }));
    await testDb.db.update(searchIndex).set({ searchProvider: 'azure-ai-search' }).where(eq(searchIndex.id, id));
    const { status, body } = await update(id, { stopWords: ['a', 'the', 'and'] });
    expect(status).toBe(400);
    expect(JSON.stringify(body)).toContain("Custom stop words can't be applied on Azure AI Search");
    expect((await stored(id)).stopWords).toEqual(['a', 'the']);
  });

  it('lets a stored word be removed', async () => {
    const id = idOf(await create({ searchProvider: 'elasticsearch', stopWords: ['a', 'the'] }));
    await testDb.db.update(searchIndex).set({ searchProvider: 'azure-ai-search' }).where(eq(searchIndex.id, id));
    expect((await update(id, { stopWords: ['a'] })).status).toBe(200);
    expect((await stored(id)).stopWords).toEqual(['a']);
  });
});

describe('importing onto Azure', () => {
  it('succeeds and stores no stop words', async () => {
    engine.provider = 'azure-ai-search';
    const name = nextName();
    const res = await importRoute.POST(new NextRequest('http://localhost/api/search-indexes/import', {
      method: 'POST',
      body: JSON.stringify({
        importData: {
          version: '1.0',
          exportedAt: new Date().toISOString(),
          searchIndex: { name, displayName: name, searchType: 'lexical', indexingStrategy: 'on_upload', language: 'danish', synonyms: [], stopWords: ['the'], rrfRankConstant: 60, rrfWindowSize: 100 },
          fields: [],
        },
      }),
    }));
    engine.provider = 'elasticsearch';
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(JSON.stringify(body)).toContain("won't be imported");
    const [row] = await testDb.db.select().from(searchIndex).where(eq(searchIndex.name, name));
    expect(row.stopWords).toEqual([]);
    expect(row.language).toBe('danish');
  });
});

describe('the same refusals for a role that may edit indexes', () => {
  const EDITOR: UserAccess = {
    userId: 'editor',
    roleId: 'editor-role',
    roleName: 'Editor',
    isAdmin: false,
    permissions: new Set(['search-indexes:view', 'search-indexes:edit']) as UserAccess['permissions'],
  };
  const asEditor = async <T>(run: () => Promise<T>): Promise<T> => {
    const previous = accessStub.access;
    accessStub.access = EDITOR;
    try { return await run(); } finally { accessStub.access = previous; }
  };

  it('refuses an unavailable language on create with a 400, not a permission error', async () => {
    const { status, body } = await asEditor(() => create({ searchProvider: 'azure-ai-search', language: 'cjk' }));
    expect(status).toBe(400);
    expect(JSON.stringify(body)).toContain("Language 'cjk' isn't available for Azure AI Search");
  });

  it('refuses adding stop words on update with a 400, not a permission error', async () => {
    const created = await create({ searchProvider: 'elasticsearch', stopWords: ['a'] });
    const id = (created.body.data?.id ?? created.body.id) as string;
    await testDb.db.update(searchIndex).set({ searchProvider: 'azure-ai-search' }).where(eq(searchIndex.id, id));
    const { status, body } = await asEditor(() => update(id, { stopWords: ['a', 'new'] }));
    expect(status).toBe(400);
    expect(JSON.stringify(body)).toContain("Custom stop words can't be applied on Azure AI Search");
  });

  it('control: a role without edit permission is refused with 403 before any language rule', async () => {
    const viewer = { ...EDITOR, permissions: new Set(['search-indexes:view']) as UserAccess['permissions'] };
    const previous = accessStub.access;
    accessStub.access = viewer;
    try {
      expect((await create({ searchProvider: 'azure-ai-search', language: 'cjk' })).status).toBe(403);
    } finally { accessStub.access = previous; }
  });
});
