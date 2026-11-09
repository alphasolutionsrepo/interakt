// src/features/sessions/sessions.repository.delete-empty.test.ts

/**
 * A session created for a chat turn that was never saved (the visitor left) is deleted,
 * but only while it has no messages: a conversation is never lost. Runs the delete on
 * real Postgres (PGlite), with just the columns it reads.
 */

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const client = new PGlite();
vi.mock('@/db/index', () => ({
  get db() {
    return drizzle(client);
  },
}));

import { deleteEmptySession } from './sessions.repository';

const EMPTY = '00000000-0000-0000-0000-000000000001';
const TALKED = '00000000-0000-0000-0000-000000000002';

const remaining = async () =>
  (await client.query<{ id: string }>('SELECT id FROM ai_sessions ORDER BY id')).rows.map((r) => r.id);

beforeAll(async () => {
  await client.exec(`
    CREATE TABLE ai_sessions (id uuid PRIMARY KEY, message_count integer NOT NULL DEFAULT 0);
    INSERT INTO ai_sessions VALUES ('${EMPTY}', 0), ('${TALKED}', 2);
  `);
});
afterAll(async () => {
  await client.close();
});

describe('deleteEmptySession', () => {
  it('keeps a session that has messages', async () => {
    expect(await deleteEmptySession(TALKED)).toBe(false);
    expect(await remaining()).toEqual([EMPTY, TALKED]);
  });

  it('deletes one that has none', async () => {
    expect(await deleteEmptySession(EMPTY)).toBe(true);
    expect(await remaining()).toEqual([TALKED]);
  });
});
