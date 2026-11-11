// src/features/tools/tools.experiences.route.test.ts

/**
 * GET /api/tools/:id/experiences lists the chat experiences that use the tool (the tool page's
 * "Used in" stat and card read the list) and keeps the count. Real database (PGlite), real
 * route, and the page's own client reading the answer.
 */

import { sql } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import * as route from '@/app/api/tools/[id]/experiences/route';
import { toolsApi } from '@/app/tools/_lib/api-client';
import { createAppTestDb, type AppTestDb } from '@/shared/test/app-test-db';

let testDb: AppTestDb;
vi.mock('@/db/index', () => ({ get db() { return testDb.db; } }));
vi.mock('@/features/auth/auth.api.handlers', async () => (await import('@/shared/test/access-stub')).signedInAuth);
vi.mock('@/features/access/access.service', async () => (await import('@/shared/test/access-stub')).accessService);

beforeAll(async () => { testDb = await createAppTestDb(); }, 60_000);
afterAll(() => testDb.close());

const U = '00000000-0000-4000-8000-0000000000aa';
const one = async (q: ReturnType<typeof sql>) => ((await testDb.db.execute(q)) as unknown as { rows: Array<{ id: string }> }).rows[0].id;
const tag = () => `x${Math.random().toString(36).slice(2, 8)}`;
const tool = () => { const t = tag(); return one(sql`INSERT INTO tools (name, slug, ai_description) VALUES (${t}, ${t}, 'd') RETURNING id`); };
const chat = (name: string, isActive = true) => one(sql`INSERT INTO ai_experiences (name, slug, created_by, persona_config, session_config, access_config, observability_config, is_active) VALUES (${name}, ${tag()}, ${U}, '{}', '{}', '{}', '{}', ${isActive}) RETURNING id`);
const attach = (e: string, t: string) => testDb.db.execute(sql`INSERT INTO ai_experience_tools (ai_experience_id, tool_id) VALUES (${e}, ${t})`);
const get = (id: string) => route.GET(new NextRequest(`http://localhost/api/tools/${id}/experiences`), { params: Promise.resolve({ id }) });

describe('GET /api/tools/:id/experiences', () => {
  it('lists the experiences that use the tool, with the count, and no others', async () => {
    const [used, other] = [await tool(), await tool()];
    const [b, a, off] = [await chat('Beta'), await chat('Alpha'), await chat('Dormant', false)];
    await attach(b, used); await attach(a, used); await attach(off, used);
    await attach(await chat('Elsewhere'), other);

    const body = (await (await get(used)).json()).data;
    expect(body.toolId).toBe(used);
    expect(body.experienceCount).toBe(3);
    expect(body.experiences.map((e: { name: string }) => e.name)).toEqual(['Alpha', 'Beta', 'Dormant']);
    expect(body.experiences[0]).toEqual({ id: a, name: 'Alpha', slug: expect.any(String), isActive: true });
    expect(body.experiences[2].isActive).toBe(false);
  });

  it('answers an empty list for a tool nothing uses, and 404 for an unknown tool', async () => {
    const body = (await (await get(await tool())).json()).data;
    expect(body).toMatchObject({ experienceCount: 0, experiences: [] });
    expect((await get('00000000-0000-4000-8000-0000000000ff')).status).toBe(404);
  });

  it("is what the tool page's client reads", async () => {
    const t = await tool();
    await attach(await chat('Shop assistant'), t);
    vi.stubGlobal('fetch', async (url: string) => (url === `/api/tools/${t}/experiences` ? get(t) : new Response('{}', { status: 404 })));
    try {
      const { experiences } = await toolsApi.getExperiences(t);
      expect(experiences.map((e) => e.name)).toEqual(['Shop assistant']);
    } finally { vi.unstubAllGlobals(); }
  });
});
