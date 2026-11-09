// src/features/access/roles.migration.test.ts

/**
 * Migration 0036 turns the fixed user role (user / moderator / admin) into editable role rows.
 * Existing users get the closest role: admin -> Admin, moderator -> Editor, user (and NULL,
 * the old column default) -> Viewer. Editor and Viewer start with the defaults in
 * permissions.ts.
 *
 * Runs the migrations on a real Postgres (PGlite): everything before 0036, then users in the
 * old shape, then 0036.
 */

import fs from 'fs';
import path from 'path';

import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  ADMIN_ROLE_ID,
  ALL_PERMISSIONS,
  EDITOR_DEFAULT_PERMISSIONS,
  VIEWER_DEFAULT_PERMISSIONS,
} from './permissions';

const MIGRATIONS = path.resolve(__dirname, '../../../db/drizzle');
const ROLES_MIGRATION = '0036_roles';

const sqlOf = (tag: string) =>
  fs.readFileSync(path.join(MIGRATIONS, `${tag}.sql`), 'utf8')
    .replace(/\bvector\(\d+\)/g, 'real[]')
    .replace(/^CREATE INDEX[^;]*USING hnsw[^;]*;(--> statement-breakpoint)?$/gm, '')
    .replaceAll('--> statement-breakpoint', '');

let client: PGlite;

beforeAll(async () => {
  client = new PGlite();
  const { entries } = JSON.parse(fs.readFileSync(path.join(MIGRATIONS, 'meta/_journal.json'), 'utf8')) as { entries: Array<{ tag: string }> };
  const before = entries.slice(0, entries.findIndex((e) => e.tag === ROLES_MIGRATION));
  for (const { tag } of before) await client.exec(sqlOf(tag));

  await client.exec(`
    INSERT INTO "user" (email, role) VALUES ('admin@x.test', 'admin'), ('mod@x.test', 'moderator'), ('user@x.test', 'user');
    INSERT INTO "user" (email, role) VALUES ('null@x.test', NULL);
  `);
  await client.exec(sqlOf(ROLES_MIGRATION));
}, 60_000);

afterAll(() => client.close());

const roleOf = async (email: string) =>
  (await client.query<{ name: string }>(`SELECT r.name FROM "user" u JOIN roles r ON r.id = u.role_id WHERE u.email = $1`, [email])).rows[0]?.name;

describe('migration 0036: roles', () => {
  it('gives each existing user the closest new role', async () => {
    expect(await roleOf('admin@x.test')).toBe('Admin');
    expect(await roleOf('mod@x.test')).toBe('Editor');
    expect(await roleOf('user@x.test')).toBe('Viewer');
    expect(await roleOf('null@x.test')).toBe('Viewer');
  });

  it('creates the built-in Admin with the fixed id the code uses', async () => {
    const { rows } = await client.query<{ id: string; is_built_in: boolean }>(`SELECT id, is_built_in FROM roles WHERE name = 'Admin'`);
    expect(rows).toEqual([{ id: ADMIN_ROLE_ID, is_built_in: true }]);
  });

  it('seeds Editor and Viewer with the defaults in permissions.ts, all of them real permissions', async () => {
    const perms = async (name: string) =>
      (await client.query<{ permissions: string[] }>(`SELECT permissions FROM roles WHERE name = $1`, [name])).rows[0].permissions;
    expect([...(await perms('Editor'))].sort()).toEqual([...EDITOR_DEFAULT_PERMISSIONS].sort());
    expect([...(await perms('Viewer'))].sort()).toEqual([...VIEWER_DEFAULT_PERMISSIONS].sort());
    for (const p of [...(await perms('Editor')), ...(await perms('Viewer'))]) expect(ALL_PERMISSIONS).toContain(p);
  });

  it('keeps Editor away from keys, secrets, users, running jobs and setup, and Viewer read-only', () => {
    expect(EDITOR_DEFAULT_PERMISSIONS).not.toEqual(expect.arrayContaining(['ai-providers:manage']));
    for (const p of ['ai-providers:manage', 'secrets:manage', 'users:manage', 'jobs:run', 'setup:run']) {
      expect(EDITOR_DEFAULT_PERMISSIONS).not.toContain(p);
    }
    for (const p of VIEWER_DEFAULT_PERMISSIONS) expect(p).toMatch(/:view$/);
  });

  it('drops the old role column and enum, and makes role_id required', async () => {
    const cols = await client.query<{ column_name: string; is_nullable: string }>(
      `SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = 'user' AND column_name IN ('role', 'role_id')`,
    );
    expect(cols.rows).toEqual([{ column_name: 'role_id', is_nullable: 'NO' }]);
    const types = await client.query(`SELECT 1 FROM pg_type WHERE typname = 'user_role'`);
    expect(types.rows).toEqual([]);
  });

  it('refuses to delete a role a user holds', async () => {
    await expect(client.exec(`DELETE FROM roles WHERE name = 'Viewer'`)).rejects.toThrow(/foreign key/);
  });
});
