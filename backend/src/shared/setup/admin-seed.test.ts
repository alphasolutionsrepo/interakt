// src/shared/setup/admin-seed.test.ts

/**
 * The first admin, seeded from the environment on a fresh database, gets the built-in Admin
 * role, and a database that has an Admin is left alone. Real migrations on PGlite.
 */

import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { user } from '@/db/schema/users.schema';
import { ADMIN_ROLE_ID } from '@/features/access/permissions';
import { createAppTestDb, type AppTestDb } from '@/shared/test/app-test-db';

let testDb: AppTestDb;
vi.mock('@/db/index', () => ({ get db() { return testDb.db; } }));

import { seedAdminFromYaml } from './admin-seed';

beforeAll(async () => { testDb = await createAppTestDb(); }, 60_000);
afterAll(() => testDb.close());
afterEach(() => vi.unstubAllEnvs());

describe('seeding the first admin', () => {
  it('gives the admin from the environment the built-in Admin role, once', async () => {
    vi.stubEnv('SETUP_ADMIN_EMAIL', 'first@x.test');
    vi.stubEnv('SETUP_ADMIN_PASSWORD', 'Passw0rd-first');
    await seedAdminFromYaml();
    const [first] = await testDb.db.select().from(user).where(eq(user.email, 'first@x.test'));
    expect(first).toMatchObject({ roleId: ADMIN_ROLE_ID, isActive: true });

    vi.stubEnv('SETUP_ADMIN_EMAIL', 'second@x.test');
    await seedAdminFromYaml();
    expect(await testDb.db.select().from(user).where(eq(user.email, 'second@x.test'))).toEqual([]);
  });
});
