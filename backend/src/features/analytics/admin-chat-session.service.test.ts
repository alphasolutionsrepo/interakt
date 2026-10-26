// src/features/analytics/admin-chat-session.service.test.ts

/**
 * Searching analytics chat history: a conversation matches on its title, its
 * experience, or anything said in it, ignoring case, and the search text is
 * taken literally. Runs on real Postgres (PGlite) with the analytics
 * migrations applied.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAnalyticsTestDb, type AnalyticsTestDb } from '@/shared/test/analytics-test-db';

let testDb: AnalyticsTestDb;
vi.mock('@/db/index', () => ({
  get analyticsDB() {
    return testDb.db;
  },
}));

import { adminChatSessions, type AdminChatMessage } from '@/db/analytics-schema';

import { deleteSession, getSessionCount, listSessions } from './admin-chat-session.service';

const message = (role: AdminChatMessage['role'], content: string): AdminChatMessage => ({
  id: crypto.randomUUID(),
  role,
  content,
  timestamp: '2026-10-20T10:00:00Z',
});

async function addSession(title: string, messages: AdminChatMessage[], experienceName: string | null = null) {
  const [row] = await testDb.db
    .insert(adminChatSessions)
    .values({ title, messages, experienceName, messageCount: messages.length, lastMessageAt: new Date() })
    .returning({ id: adminChatSessions.id });
  return row.id;
}

beforeAll(async () => {
  testDb = await createAnalyticsTestDb();
});
beforeEach(async () => {
  await testDb.reset();
});
afterAll(async () => {
  await testDb.close();
});

describe('listSessions search', () => {
  it('matches the title, the experience, and what was said, ignoring case', async () => {
    const byTitle = await addSession('Zero results last week', []);
    const byExperience = await addSession('Weekly check', [], 'Store Assistant');
    const byAnswer = await addSession('Something else', [
      message('user', 'How did search do?'),
      message('assistant', 'Gift card searches found nothing 38 times.'),
    ]);
    await addSession('Unrelated', [message('user', 'Show me tool usage')]);

    const ids = async (search: string) => (await listSessions({ search })).map((s) => s.id).sort();

    expect(await ids('ZERO RESULTS')).toEqual([byTitle]);
    expect(await ids('store assistant')).toEqual([byExperience]);
    expect(await ids('gift card')).toEqual([byAnswer]);
    expect(await getSessionCount('gift card')).toBe(1);
  });

  it('lists everything for an empty search', async () => {
    await addSession('One', []);
    await addSession('Two', []);

    expect(await listSessions({ search: '  ' })).toHaveLength(2);
    expect(await getSessionCount()).toBe(2);
  });

  it('takes % and _ literally', async () => {
    const percent = await addSession('Zero-result rate 8% last week', []);
    await addSession('Rate last week', []);

    expect((await listSessions({ search: '8%' })).map((s) => s.id)).toEqual([percent]);
    expect(await listSessions({ search: '_' })).toEqual([]);
  });
});

describe('deleteSession', () => {
  it('removes the conversation and reports whether it existed', async () => {
    const id = await addSession('To delete', [message('user', 'hello')]);

    expect(await deleteSession(id)).toBe(true);
    expect(await deleteSession(id)).toBe(false);
    expect(await getSessionCount()).toBe(0);
  });
});
