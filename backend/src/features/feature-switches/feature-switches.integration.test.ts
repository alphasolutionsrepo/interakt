// src/features/feature-switches/feature-switches.integration.test.ts

/**
 * Feature switches end to end: the real route handlers, the real gates (route guard, public
 * route wrapper, access-token checks, ingestion) and the real stored switches on a real
 * Postgres (PGlite, all migrations). Only the session (who signed in) is stubbed.
 *
 * Plays an Admin switching areas off and on, a non-Admin trying to, the deployment setting
 * pinning an area off, another server instance changing the switches, and the callers of each
 * kind of route: the admin, a widget with an access token, a dashboard session on a public
 * route, a server with an ingestion key, and the built-in help.
 */

import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { FEATURES_OFF_ENV, PINNED_OFF_MESSAGE, TURNED_OFF_CODE, TURNED_OFF_MESSAGE } from './areas';
import { clearFeatureSwitchCache, isAreaOn } from './feature-switches.service';

import * as aiExperiencesRoute from '@/app/api/ai-experiences/route';
import * as documentsRoute from '@/app/api/search-indexes/[id]/documents/route';
import * as settingsRoute from '@/app/api/settings/features/route';
import * as slugChatRoute from '@/app/api/v1/ai-experiences/[slug]/chat/route';
import * as widgetConfigRoute from '@/app/api/v1/ai-experiences/widget-config/route';
import * as embedSnippetRoute from '@/app/api/v1/embed-snippet/route';
import * as searchRoute from '@/app/api/v1/search/route';
import * as summarizeRoute from '@/app/api/v1/summarize/route';
import { aiExperiences } from '@/db/schema/ai-experience.schema';
import { globalSearchSettings } from '@/db/schema/global-search-settings.schema';
import { roles } from '@/db/schema/roles.schema';
import { searchExperiences } from '@/db/schema/search-experience.schema';
import { user } from '@/db/schema/users.schema';
import { ADMIN_ROLE_ID } from '@/features/access/permissions';
import { aiExperienceAccess } from '@/features/auth/public-access';
import { authenticateTokenOrSession } from '@/features/auth/token-or-session';
import { createAppTestDb, type AppTestDb } from '@/shared/test/app-test-db';

let testDb: AppTestDb;
let session: { user: { id: string } } | null = null;
vi.mock('@/db/index', () => ({ get db() { return testDb.db; } }));
vi.mock('@/features/auth/auth.api.handlers', () => ({ auth: async () => session }));

const VIEWER = '00000000-0000-4000-8000-000000000003';

beforeAll(async () => { testDb = await createAppTestDb(); }, 60_000);
afterAll(() => testDb.close());

let n = 0;
async function makeUser(roleId: string): Promise<string> {
  const [row] = await testDb.db.insert(user).values({ email: `f${++n}@x.test`, roleId, isActive: true, firstName: 'First' }).returning();
  return row.id;
}
const as = (userId: string | null) => { session = userId ? { user: { id: userId } } : null; };

type Route = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
async function call(fn: unknown, method: string, url: string, opts: { body?: unknown; params?: Record<string, string>; headers?: Record<string, string> } = {}) {
  const req = new NextRequest(`http://localhost${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...(opts.body !== undefined && { body: JSON.stringify(opts.body) }),
  });
  const res = await (fn as Route)(req, { params: Promise.resolve(opts.params ?? {}) });
  return { status: res.status, body: (await res.json().catch(() => null)) as Record<string, unknown> | null };
}
const turnedOff = { status: 404, body: expect.objectContaining({ code: TURNED_OFF_CODE, message: TURNED_OFF_MESSAGE }) };

async function switchAreas(areas: Record<string, boolean>) {
  const res = await call(settingsRoute.PUT, 'PUT', '/api/settings/features', { body: { areas } });
  expect(res.status).toBe(200);
  return res;
}

let admin: string;
let chat: { id: string; slug: string; accessToken: string };
let search: { id: string; accessToken: string };
beforeEach(async () => {
  // Every test starts with everything on and nothing cached
  await testDb.db.delete(globalSearchSettings);
  clearFeatureSwitchCache();
  delete process.env[FEATURES_OFF_ENV];
  admin = await makeUser(ADMIN_ROLE_ID);
  as(admin);
  const tag = ++n;
  const [ai] = await testDb.db.insert(aiExperiences).values({
    name: `Chat ${tag}`, slug: `chat-${tag}`, createdBy: admin,
    personaConfig: {}, sessionConfig: {}, accessConfig: {}, observabilityConfig: {},
  } as never).returning();
  chat = { id: ai.id, slug: ai.slug, accessToken: ai.accessToken };
  const [se] = await testDb.db.insert(searchExperiences).values({
    name: `Search ${tag}`, slug: `search-${tag}`, createdBy: admin,
    searchConfig: {}, aiConfig: { enabled: true, summary: { enabled: true } }, toolsConfig: {},
  } as never).returning();
  search = { id: se.id, accessToken: se.accessToken };
});
afterEach(() => {
  delete process.env[FEATURES_OFF_ENV];
  vi.restoreAllMocks();
});

describe('an area switched off', () => {
  it('answers its admin routes 404 "turned off", to an Admin too, and normally again once back on', async () => {
    expect((await call(aiExperiencesRoute.GET, 'GET', '/api/ai-experiences')).status).toBe(200);
    await switchAreas({ chat: false });
    expect(await call(aiExperiencesRoute.GET, 'GET', '/api/ai-experiences')).toMatchObject(turnedOff);
    // However the path is spelled
    expect(await call(aiExperiencesRoute.GET, 'GET', '/api/%61i-experiences')).toMatchObject(turnedOff);
    expect(await call(aiExperiencesRoute.GET, 'GET', '/api//ai-experiences/')).toMatchObject(turnedOff);
    await switchAreas({ chat: true });
    expect((await call(aiExperiencesRoute.GET, 'GET', '/api/ai-experiences')).status).toBe(200);
  });

  it('answers a public route called with the experience\'s access token 404', async () => {
    const token = { Authorization: `Bearer ${chat.accessToken}` };
    expect((await call(widgetConfigRoute.GET, 'GET', '/api/v1/ai-experiences/widget-config', { headers: token })).status).toBe(200);
    await switchAreas({ chat: false });
    // The Help assistant is still on, so the route stays open: the token check refuses
    expect(await call(widgetConfigRoute.GET, 'GET', '/api/v1/ai-experiences/widget-config', { headers: token })).toMatchObject(turnedOff);

    await switchAreas({ chat: true, search: false });
    const searchToken = { 'X-Access-Token': search.accessToken };
    expect(await call(searchRoute.POST, 'POST', '/api/v1/search', { headers: searchToken, body: { query: 'q' } })).toMatchObject(turnedOff);
  });

  it('answers a public route called with a dashboard session 404', async () => {
    const req = () => new NextRequest(`http://localhost/api/v1/ai-experiences/${chat.slug}/chat`, { method: 'POST' });
    const experience = aiExperienceAccess({ ...chat, accessConfig: {} as never, isBuiltIn: false });
    expect((await authenticateTokenOrSession(req(), experience)).caller).toBe('admin');
    await switchAreas({ chat: false });
    expect(await call(slugChatRoute.POST, 'POST', `/api/v1/ai-experiences/${chat.slug}/chat`, { params: { slug: chat.slug }, body: { message: 'hi' } }))
      .toMatchObject(turnedOff);
  });

  it('answers a server writing documents with an ingestion key 404', async () => {
    as(null);
    const index = '00000000-0000-4000-8000-0000000000aa';
    const key = { headers: { Authorization: 'Bearer not-a-key' }, params: { id: index } };
    // On, the handler checks the key (and refuses this one)
    expect((await call(documentsRoute.GET, 'GET', `/api/search-indexes/${index}/documents`, key)).status).toBe(401);
    as(admin);
    await switchAreas({ 'managed-indexes': false });
    as(null);
    expect(await call(documentsRoute.GET, 'GET', `/api/search-indexes/${index}/documents`, key)).toMatchObject(turnedOff);
  });

  it('turns off what needs it: AI summaries with Search', async () => {
    await switchAreas({ search: false });
    const listed = await call(settingsRoute.GET, 'GET', '/api/settings/features');
    expect(listed.body?.data).toMatchObject({ areas: expect.arrayContaining([
      expect.objectContaining({ id: 'ai-summaries', on: false, switchedOn: true, needsAnyOf: ['search'] }),
    ]) });
    expect(await call(summarizeRoute.POST, 'POST', '/api/v1/summarize', { headers: { 'X-Access-Token': search.accessToken }, body: { query: 'q', results: [] } }))
      .toMatchObject(turnedOff);
  });

  it('refuses the embed snippet by the experience\'s kind', async () => {
    await switchAreas({ chat: false });
    expect(await call(embedSnippetRoute.GET, 'GET', '/api/v1/embed-snippet', { headers: { 'X-Access-Token': chat.accessToken } })).toMatchObject(turnedOff);
    expect((await call(embedSnippetRoute.GET, 'GET', '/api/v1/embed-snippet', { headers: { 'X-Access-Token': search.accessToken } })).status).toBe(200);
  });

  it('keeps the built-in help working with Chat off, and refuses it with the Help assistant off', async () => {
    await testDb.db.update(aiExperiences).set({ isBuiltIn: true }).where(eq(aiExperiences.id, chat.id));
    const req = () => new NextRequest(`http://localhost/api/v1/ai-experiences/${chat.slug}/chat`, { method: 'POST' });
    const builtIn = aiExperienceAccess({ ...chat, accessConfig: {} as never, isBuiltIn: true });
    await switchAreas({ chat: false });
    expect((await authenticateTokenOrSession(req(), builtIn)).caller).toBe('admin');
    await switchAreas({ chat: true, 'help-assistant': false });
    const refused = await authenticateTokenOrSession(req(), builtIn);
    expect(refused).toMatchObject({ caller: null, refused: { status: 404 } });
    // Both off: the public route refuses before looking the experience up
    await switchAreas({ chat: false });
    expect(await call(slugChatRoute.POST, 'POST', `/api/v1/ai-experiences/${chat.slug}/chat`, { params: { slug: chat.slug }, body: { message: 'hi' } }))
      .toMatchObject(turnedOff);
  });

  it('keeps its data: switched back on, everything is as it was', async () => {
    const before = (await testDb.db.select().from(aiExperiences).where(eq(aiExperiences.id, chat.id)))[0];
    await switchAreas({ chat: false });
    expect(await call(aiExperiencesRoute.GET, 'GET', '/api/ai-experiences')).toMatchObject(turnedOff);
    expect((await testDb.db.select().from(aiExperiences).where(eq(aiExperiences.id, chat.id)))[0]).toEqual(before);
    await switchAreas({ chat: true });
    const listed = await call(aiExperiencesRoute.GET, 'GET', '/api/ai-experiences?pageSize=100');
    expect(listed.status).toBe(200);
    expect(JSON.stringify(listed.body)).toContain(chat.id);
    expect((await call(widgetConfigRoute.GET, 'GET', '/api/v1/ai-experiences/widget-config', { headers: { 'X-Access-Token': chat.accessToken } })).status).toBe(200);
  });
});

describe('who switches areas, and when it applies', () => {
  it('lets anyone signed in read the switches, and only an Admin change them', async () => {
    const viewer = await makeUser(VIEWER);
    as(viewer);
    const read = await call(settingsRoute.GET, 'GET', '/api/settings/features');
    expect(read.status).toBe(200);
    expect((read.body?.data as { areas: unknown[] }).areas).toHaveLength(7);
    expect((await call(settingsRoute.PUT, 'PUT', '/api/settings/features', { body: { areas: { chat: false } } })).status).toBe(403);

    // Even a role that may change settings isn't enough
    const [role] = await testDb.db.insert(roles).values({ name: `Settings ${++n}`, permissions: ['settings:view', 'settings:manage'] }).returning();
    as(await makeUser(role.id));
    const refused = await call(settingsRoute.PUT, 'PUT', '/api/settings/features', { body: { areas: { chat: false } } });
    expect(refused).toMatchObject({ status: 403, body: { message: 'Only an Admin can turn features on or off.' } });
    expect(await isAreaOn('chat')).toBe(true);
  });

  it('refuses an unknown area or an empty change', async () => {
    expect((await call(settingsRoute.PUT, 'PUT', '/api/settings/features', { body: { areas: { chats: false } } })).status).toBe(400);
    expect((await call(settingsRoute.PUT, 'PUT', '/api/settings/features', { body: { areas: {} } })).status).toBe(400);
  });

  it('applies a change on the next request, without a restart', async () => {
    expect((await call(aiExperiencesRoute.GET, 'GET', '/api/ai-experiences')).status).toBe(200);
    await switchAreas({ chat: false });
    expect(await call(aiExperiencesRoute.GET, 'GET', '/api/ai-experiences')).toMatchObject(turnedOff);
  });

  it('applies a change made on another server within seconds', async () => {
    let now = Date.now();
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    expect(await isAreaOn('analytics')).toBe(true);
    // Another instance saves: this one's cache doesn't know yet
    await testDb.db.insert(globalSearchSettings).values({ featuresOff: ['analytics'] });
    expect(await isAreaOn('analytics')).toBe(true);
    now += 5_000;
    expect(await isAreaOn('analytics')).toBe(false);
  });

  it('lets the deployment setting win over what the Admin chose', async () => {
    process.env[FEATURES_OFF_ENV] = 'chat, Analytics';
    expect(await call(aiExperiencesRoute.GET, 'GET', '/api/ai-experiences')).toMatchObject(turnedOff);
    const refused = await call(settingsRoute.PUT, 'PUT', '/api/settings/features', { body: { areas: { chat: true } } });
    expect(refused).toMatchObject({ status: 409, body: { message: `chat: ${PINNED_OFF_MESSAGE}` } });
    const listed = await call(settingsRoute.GET, 'GET', '/api/settings/features');
    expect(listed.body?.data).toMatchObject({ areas: expect.arrayContaining([
      expect.objectContaining({ id: 'chat', on: false, switchedOn: true, pinnedOff: true }),
      expect.objectContaining({ id: 'analytics', on: false, pinnedOff: true }),
      expect.objectContaining({ id: 'search', on: true, pinnedOff: false }),
    ]) });
    // Other areas still switch
    await switchAreas({ search: false });
    expect(await isAreaOn('search')).toBe(false);
  });

  it('keeps the other areas as they were when switching one', async () => {
    await switchAreas({ chat: false });
    await switchAreas({ analytics: false });
    expect(await isAreaOn('chat')).toBe(false);
    await switchAreas({ chat: true });
    expect(await isAreaOn('analytics')).toBe(false);
    expect(await isAreaOn('chat')).toBe(true);
  });
});
