/**
 * The error a real database gives for a malformed uuid, through the real driver and
 * Drizzle (PGlite), is the one toAppError turns into 400.
 */

import { DrizzleQueryError, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { toAppError } from './to-app-error';

import { roles } from '@/db/schema/roles.schema';
import { createAppTestDb, type AppTestDb } from '@/shared/test/app-test-db';

let testDb: AppTestDb;
beforeAll(async () => { testDb = await createAppTestDb(); }, 60_000);
afterAll(() => testDb.close());

async function thrown(run: () => Promise<unknown>): Promise<Error> {
  try { await run(); } catch (e) { return e as Error; }
  throw new Error('expected the query to fail');
}

describe('a real query comparing a uuid column with a value that is not a UUID', () => {
  it('fails as Postgres does (22P02, invalid input syntax for type uuid) and is answered 400', async () => {
    const err = await thrown(() => testDb.db.select().from(roles).where(eq(roles.id, 'not-a-uuid')));
    const causes: Array<Error & { code?: string }> = [];
    for (let c: unknown = err; c instanceof Error; c = c.cause) causes.push(c);
    // PGlite reports it as Postgres does: a Drizzle query error whose cause carries the code
    expect(err).toBeInstanceOf(DrizzleQueryError);
    expect(causes.some((c) => c.code === '22P02' && /invalid input syntax for type uuid/.test(c.message))).toBe(true);

    const appError = toAppError(err);
    expect(appError).toMatchObject({ code: 'BAD_REQUEST', status: 400, message: "That ID isn't valid." });
    expect(appError.message).not.toContain('not-a-uuid');
  });

  it('still runs a well-formed unknown ID (no error, no row)', async () => {
    const rows = await testDb.db.select().from(roles).where(eq(roles.id, '11111111-1111-1111-1111-111111111111'));
    expect(rows).toEqual([]);
  });
});
