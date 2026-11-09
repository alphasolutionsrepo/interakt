// src/shared/seeders/docs/docs-source.admin.test.ts

/** The docs (and demo) resources are created as the first Admin, found by the built-in Admin role. */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { user } from '@/db/schema/users.schema';
import { ADMIN_ROLE_ID } from '@/features/access/permissions';
import { createAppTestDb, type AppTestDb } from '@/shared/test/app-test-db';

let testDb: AppTestDb;
vi.mock('@/db/index', () => ({ get db() { return testDb.db; } }));

import { getAdminUserId } from './docs-source';

beforeAll(async () => { testDb = await createAppTestDb(); }, 60_000);
afterAll(() => testDb.close());

describe('the admin the setup works as', () => {
  it('asks for an Admin when there is none, and finds one by the Admin role', async () => {
    await testDb.db.insert(user).values({ email: 'viewer@x.test', roleId: '00000000-0000-4000-8000-000000000003' });
    await expect(getAdminUserId()).rejects.toMatchObject({ code: 'SETUP_REQUIRED' });
    const [admin] = await testDb.db.insert(user).values({ email: 'admin@x.test', roleId: ADMIN_ROLE_ID }).returning();
    expect(await getAdminUserId()).toBe(admin.id);
  });
});
