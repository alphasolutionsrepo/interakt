// src/features/tools/tools.http-url.route.test.ts

/**
 * An HTTP tool's URL keeps its host fixed: input fills only what comes after the host and its
 * "/". Saving a URL that lets input choose the host is refused with what to change; a tool saved
 * that way before can still be edited, and the tools list marks it "Needs setup" with the same
 * advice. Real routes, real tools service, real database (PGlite).
 */

import { sql } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import * as assignRoute from '@/app/api/ai-experiences/[id]/tools/route';
import * as toolRoute from '@/app/api/tools/[id]/route';
import * as toolsRoute from '@/app/api/tools/route';
import { user } from '@/db/schema/users.schema';
import { ADMIN_ROLE_ID } from '@/features/access/permissions';
import { accessStub } from '@/shared/test/access-stub';
import { createAppTestDb, type AppTestDb } from '@/shared/test/app-test-db';

let testDb: AppTestDb;
let adminId: string;
vi.mock('@/db/index', () => ({ get db() { return testDb.db; } }));
vi.mock('@/features/auth/auth.api.handlers', async () => (await import('@/shared/test/access-stub')).signedInAuth);
vi.mock('@/features/access/access.service', async () => (await import('@/shared/test/access-stub')).accessService);

beforeAll(async () => {
  testDb = await createAppTestDb();
  // Tools record who made them: sign in as a stored user
  const [admin] = await testDb.db.insert(user).values({ email: 'admin@x.test', roleId: ADMIN_ROLE_ID, isActive: true, firstName: 'Admin' }).returning();
  accessStub.session = { user: { id: admin.id } };
  adminId = admin.id;
}, 60_000);
afterAll(() => { accessStub.reset(); return testDb.close(); });

const tag = () => `t${Math.random().toString(36).slice(2, 8)}`;
const restConfig = (baseUrl: string) => ({ baseUrl, method: 'GET', responseMapping: { resultsPath: '$.items' }, timeout: 5000 });

async function create(executorConfig: Record<string, unknown>) {
  const slug = tag();
  const res = await toolsRoute.POST(new NextRequest('http://localhost/api/tools', {
    method: 'POST',
    body: JSON.stringify({ name: slug, slug, executorType: 'http', aiDescription: 'Looks up orders by their id', executorConfig }),
  }));
  return { status: res.status, body: await res.json() };
}

async function update(id: string, body: Record<string, unknown>) {
  const res = await toolRoute.PUT(
    new NextRequest(`http://localhost/api/tools/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    { params: Promise.resolve({ id }) },
  );
  return { status: res.status, body: await res.json() };
}

/** A tool stored before URLs were checked on save. */
async function storedTool(config: Record<string, unknown>): Promise<string> {
  const t = tag();
  const rows = (await testDb.db.execute(sql`INSERT INTO tools (name, slug, ai_description, executor_type, executor_config)
    VALUES (${t}, ${t}, 'Looks up orders by their id', 'http', ${JSON.stringify(config)}::jsonb) RETURNING id`)) as unknown as { rows: Array<{ id: string }> };
  return rows.rows[0].id;
}

describe('saving an HTTP tool', () => {
  it.each([
    ['the whole host', 'https://{{input.host}}/orders'],
    ['the path right after the host, with no "/"', 'https://api.example.com{{input.path}}'],
  ])('refuses a URL that takes %s from input, saying what to change', async (_case, baseUrl) => {
    const { status, body } = await create(restConfig(baseUrl));
    expect(status).toBe(400);
    expect(JSON.stringify(body)).toContain('write the host and a \\"/\\" before any {{input.field}}');
  });

  it('keeps a URL with input in its path, and every setting it was given', async () => {
    const { status, body } = await create(restConfig('https://api.example.com/orders/{{input.id}}'));
    expect(status).toBe(201);
    expect(body.data.executorConfig).toMatchObject({ baseUrl: 'https://api.example.com/orders/{{input.id}}', timeout: 5000 });
  });

  it('keeps a URL whose host is one of the admin\'s secrets', async () => {
    const { status } = await create(restConfig('https://{{secret:orders_host}}/orders/{{input.id}}'));
    expect(status).toBe(201);
  });

  it.each([
    ['a URL that is not one', { ...restConfig('orders'), baseUrl: 'orders' }],
    ['no method', { baseUrl: 'https://api.example.com/orders', responseMapping: { resultsPath: '$.items' } }],
    ['a web search setting of the wrong kind', { maxResults: 'many' }],
  ])('refuses %s', async (_case, config) => {
    expect((await create(config)).status).toBe(400);
  });

  it('keeps a web search config', async () => {
    const { status, body } = await create({ maxResults: 5, searchDepth: 'advanced' });
    expect(status).toBe(201);
    expect(body.data.executorConfig).toEqual({ maxResults: 5, searchDepth: 'advanced' });
  });

  it('refuses changing a URL to one that takes the host from input', async () => {
    const { body: created } = await create(restConfig('https://api.example.com/orders'));
    const { status } = await update(created.data.id, { executorConfig: restConfig('https://{{input.host}}/orders') });
    expect(status).toBe(400);
  });
});

describe('an HTTP tool stored with its host taken from input', () => {
  it('can still be edited while its URL stays as it was', async () => {
    const config = restConfig('https://{{input.host}}/orders');
    const id = await storedTool(config);
    const { status } = await update(id, { name: 'Renamed', executorConfig: config });
    expect(status).toBe(200);
  });

  it('cannot be added to a chat experience, saying what to change', async () => {
    const id = await storedTool(restConfig('https://{{input.host}}/orders'));
    const t = tag();
    const rows = (await testDb.db.execute(sql`INSERT INTO ai_experiences (name, slug, created_by, persona_config, session_config, access_config, observability_config)
      VALUES (${t}, ${t}, ${adminId}, '{}', '{}', '{}', '{}') RETURNING id`)) as unknown as { rows: Array<{ id: string }> };
    const experienceId = rows.rows[0].id;
    const res = await assignRoute.POST(
      new NextRequest(`http://localhost/api/ai-experiences/${experienceId}/tools`, { method: 'POST', body: JSON.stringify({ toolId: id }) }),
      { params: Promise.resolve({ id: experienceId }) },
    );
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toContain('takes the host from input');
  });

  it('is marked as needing setup in the tools list, with what to change', async () => {
    const id = await storedTool(restConfig('https://{{input.host}}/orders'));
    const fine = await storedTool(restConfig('https://api.example.com/orders/{{input.id}}'));
    const res = await toolsRoute.GET(new NextRequest('http://localhost/api/tools?limit=100'));
    const tools = (await res.json()).data as Array<{ id: string; notReadyReason?: string }>;
    expect(tools.find((t) => t.id === id)?.notReadyReason).toMatch(/takes the host from input\. Write the host and a "\/" before any \{\{input\.field\}\}/);
    expect(tools.find((t) => t.id === fine)?.notReadyReason).toBeUndefined();
  });
});
