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
import * as indexesRoute from '@/app/api/search-indexes/route';
import { searchIndex } from '@/db/schema';
import { user } from '@/db/schema/users.schema';
import { ADMIN_ROLE_ID } from '@/features/access/permissions';
import { accessStub } from '@/shared/test/access-stub';
import { createAppTestDb, type AppTestDb } from '@/shared/test/app-test-db';

let testDb: AppTestDb;
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
