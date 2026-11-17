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
    ['the whole start, scheme included', '{{input.base}}/orders'],
  ])('refuses a URL that takes %s from input, saying what to change', async (_case, baseUrl) => {
    const { status, body } = await create(restConfig(baseUrl));
    expect(status).toBe(400);
    expect(JSON.stringify(body)).toContain('write the host and a \\"/\\" before any {{input.field}}');
  });

  it.each(['orders', 'api.example.com/orders', 'http//api.example.com/orders', 'localhost:8080/api'])('says %s is not a full URL, not that the host must be fixed', async (baseUrl) => {
    const { status, body } = await create(restConfig(baseUrl));
    expect(status).toBe(400);
    expect(JSON.stringify(body)).toContain('not a full URL');
    expect(JSON.stringify(body)).not.toContain('fixed host');
  });

  it('accepts a full URL with spaces around it, as it did before', async () => {
    const { status } = await create(restConfig('  https://api.example.com/orders/{{input.id}} '));
    expect(status).toBe(201);
  });

  it('keeps a URL with input in its path, and every setting it was given', async () => {
    const { status, body } = await create(restConfig('https://api.example.com/orders/{{input.id}}'));
    expect(status).toBe(201);
    expect(body.data.executorConfig).toMatchObject({ baseUrl: 'https://api.example.com/orders/{{input.id}}', timeout: 5000 });
  });

  it.each([
    ['host', 'https://{{secret:orders_host}}/orders/{{input.id}}'],
    ['whole server address', '{{secret:orders_api}}/orders/{{input.id}}'],
  ])('keeps a URL whose %s is one of the admin\'s secrets', async (_case, baseUrl) => {
    const { status } = await create(restConfig(baseUrl));
    expect(status).toBe(201);
  });

  it('refuses input right after a secret server address, with no "/"', async () => {
    expect((await create(restConfig('{{secret:orders_api}}{{input.path}}'))).status).toBe(400);
  });

  it.each([
    ['a URL that is not one', { ...restConfig('orders'), baseUrl: 'orders' }],
    ['no method', { baseUrl: 'https://api.example.com/orders', responseMapping: { resultsPath: '$.items' } }],
    ['a web search setting of the wrong kind', { maxResults: 'many' }],
  ])('refuses %s', async (_case, config) => {
    expect((await create(config)).status).toBe(400);
  });

  it('refuses web search settings, which belong on a Web Search tool', async () => {
    const { status, body } = await create({ maxResults: 5, searchDepth: 'advanced' });
    expect(status).toBe(400);
    expect(JSON.stringify(body)).toContain('baseUrl');
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
    const secretServer = await storedTool(restConfig('{{secret:orders_api}}/orders/{{input.id}}'));
    const res = await toolsRoute.GET(new NextRequest('http://localhost/api/tools?limit=100'));
    const tools = (await res.json()).data as Array<{ id: string; notReadyReason?: string }>;
    expect(tools.find((t) => t.id === id)?.notReadyReason).toMatch(/takes the host from input\. Write the host and a "\/" before any \{\{input\.field\}\}/);
    expect(tools.find((t) => t.id === fine)?.notReadyReason).toBeUndefined();
    expect(tools.find((t) => t.id === secretServer)?.notReadyReason).toBeUndefined();
  });
});

describe('an HTTP tool stored with a URL that is not a full URL', () => {
  it('is marked as needing setup, saying to use a full URL; one with spaces around a full URL is not, and one starting with input gets the host advice', async () => {
    const partial = await storedTool(restConfig('api.example.com/orders/{{input.id}}'));
    const spaced = await storedTool(restConfig(' https://api.example.com/orders/{{input.id}}'));
    const fromInput = await storedTool(restConfig('{{input.base}}/orders'));
    const res = await toolsRoute.GET(new NextRequest('http://localhost/api/tools?limit=100'));
    const tools = (await res.json()).data as Array<{ id: string; notReadyReason?: string }>;
    expect(tools.find((t) => t.id === partial)?.notReadyReason).toMatch(/its URL is not a full URL\. Use one that starts with https:\/\//);
    expect(tools.find((t) => t.id === spaced)?.notReadyReason).toBeUndefined();
    // A URL that starts with input is about the host, not a missing scheme
    expect(tools.find((t) => t.id === fromInput)?.notReadyReason).toMatch(/takes the host from input/);
  });
});

describe('an HTTP tool stored with web search settings', () => {
  it('cannot be added to a chat experience, and the tools list says to use a Web Search tool', async () => {
    const id = await storedTool({ maxResults: 5, searchDepth: 'advanced' });
    const t = tag();
    const rows = (await testDb.db.execute(sql`INSERT INTO ai_experiences (name, slug, created_by, persona_config, session_config, access_config, observability_config)
      VALUES (${t}, ${t}, ${adminId}, '{}', '{}', '{}', '{}') RETURNING id`)) as unknown as { rows: Array<{ id: string }> };
    const experienceId = rows.rows[0].id;
    const res = await assignRoute.POST(
      new NextRequest(`http://localhost/api/ai-experiences/${experienceId}/tools`, { method: 'POST', body: JSON.stringify({ toolId: id }) }),
      { params: Promise.resolve({ id: experienceId }) },
    );
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toContain('use a Web Search tool');

    const list = await toolsRoute.GET(new NextRequest('http://localhost/api/tools?limit=100'));
    const tools = (await list.json()).data as Array<{ id: string; notReadyReason?: string }>;
    expect(tools.find((tool) => tool.id === id)?.notReadyReason).toMatch(/needs a URL and a method/);
  });

  it('can still be renamed with its settings sent back as they were, in any key order', async () => {
    const id = await storedTool({ maxResults: 5, searchDepth: 'advanced' });
    const { status } = await update(id, { name: 'Renamed', executorConfig: { searchDepth: 'advanced', maxResults: 5 } });
    expect(status).toBe(200);
  });

  it('cannot have its web search settings changed while it has no URL and method', async () => {
    const id = await storedTool({ maxResults: 5, searchDepth: 'advanced' });
    const { status } = await update(id, { executorConfig: { maxResults: 8, searchDepth: 'advanced' } });
    expect(status).toBe(400);
  });

  it('can be given a URL and a method to become a working HTTP tool', async () => {
    const id = await storedTool({ maxResults: 5, searchDepth: 'advanced' });
    const { status } = await update(id, { executorConfig: restConfig('https://api.example.com/orders/{{input.id}}') });
    expect(status).toBe(200);
  });
});
