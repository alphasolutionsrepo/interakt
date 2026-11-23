// src/features/sessions/sessions.service.owner.test.ts

/**
 * A session loads only for the experience that started it: another experience's session
 * id is treated like an unknown one. Real sessions service and repository on Postgres (PGlite).
 */

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import * as repository from './sessions.repository';
import * as sessionsService from './sessions.service';

import { aiExperiences, aiSessions } from '@/db/schema';
import { createAppTestDb, type AppTestDb } from '@/shared/test/app-test-db';

let testDb: AppTestDb;
vi.mock('@/db/index', () => ({ get db() { return testDb.db; } }));
vi.mock('@/shared/logger/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('@/features/embedding', () => ({ embed: vi.fn().mockResolvedValue(null), prepareMessageText: vi.fn(() => 'text') }));
vi.mock('@/features/ai-experience/ai-experience.service', () => ({
  getAIExperienceById: vi.fn(async (id: string) => ({ id, isActive: true })),
}));


let expA: string;
let expB: string;

beforeAll(async () => {
  testDb = await createAppTestDb();
  const make = async (slug: string) => (await testDb.db.insert(aiExperiences).values({
    name: slug, slug, createdBy: '00000000-0000-0000-0000-000000000001',
    personaConfig: {}, sessionConfig: {}, accessConfig: {}, observabilityConfig: {},
  } as never).returning())[0].id;
  expA = await make('exp-a');
  expB = await make('exp-b');
}, 60_000);
afterAll(() => testDb.close());

describe('getSessionWithWindow', () => {
  it("returns the experience's own session with its messages", async () => {
    const { id } = await sessionsService.createSession({ aiExperienceId: expA, ttlMinutes: 60 });
    await sessionsService.addMessages(id, [{ role: 'user', content: 'hello' }, { role: 'assistant', content: 'hi' }] as never);

    const result = await sessionsService.getSessionWithWindow(id, 10, expA);

    expect(result?.session.id).toBe(id);
    expect(result?.messages.map((m) => m.content)).toEqual(['hello', 'hi']);
  });

  it("returns null for another experience's session, without loading its messages", async () => {
    const { id } = await sessionsService.createSession({ aiExperienceId: expA, ttlMinutes: 60 });
    await sessionsService.addMessages(id, [{ role: 'user', content: 'private' }] as never);
    const loadWindow = vi.spyOn(repository, 'loadMessageWindow');

    expect(await sessionsService.getSessionWithWindow(id, 10, expB)).toBeNull();

    expect(loadWindow).not.toHaveBeenCalled();
    loadWindow.mockRestore();
    // The session itself is untouched
    const [row] = await testDb.db.select().from(aiSessions).where(eq(aiSessions.id, id));
    expect(row.aiExperienceId).toBe(expA);
  });

  it('returns null for an unknown session id', async () => {
    expect(await sessionsService.getSessionWithWindow('00000000-0000-0000-0000-0000000000ff', 10, expA)).toBeNull();
  });
});
