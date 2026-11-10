// src/shared/seeders/docs/built-in.migration.test.ts

/**
 * Migration 0037 adds the "built in" mark to experiences. The help experiences an earlier docs
 * setup made (its registry entry exists, under the help slugs) are marked; nothing else is,
 * including an experience that only shares a help slug on an install where the setup never ran.
 *
 * Runs the migrations on a real Postgres (PGlite): everything before 0037, then the data, then 0037.
 */

import fs from 'fs';
import path from 'path';

import { PGlite } from '@electric-sql/pglite';
import { afterAll, describe, expect, it } from 'vitest';

const MIGRATIONS = path.resolve(__dirname, '../../../../db/drizzle');
const MIGRATION = '0037_built_in_experiences';

const sqlOf = (tag: string) =>
  fs.readFileSync(path.join(MIGRATIONS, `${tag}.sql`), 'utf8')
    .replace(/\bvector\(\d+\)/g, 'real[]')
    .replace(/^CREATE INDEX[^;]*USING hnsw[^;]*;(--> statement-breakpoint)?$/gm, '')
    .replaceAll('--> statement-breakpoint', '');

const clients: PGlite[] = [];
afterAll(async () => { for (const c of clients) await c.close(); });

/** A database migrated up to just before 0037, with the given data, then 0037 */
async function migrated(data: string): Promise<PGlite> {
  const client = new PGlite();
  clients.push(client);
  const { entries } = JSON.parse(fs.readFileSync(path.join(MIGRATIONS, 'meta/_journal.json'), 'utf8')) as { entries: Array<{ tag: string }> };
  for (const { tag } of entries.slice(0, entries.findIndex((e) => e.tag === MIGRATION))) await client.exec(sqlOf(tag));
  await client.exec(data);
  await client.exec(sqlOf(MIGRATION));
  return client;
}

const U = '00000000-0000-4000-8000-0000000000aa';
const chat = (slug: string) =>
  `INSERT INTO ai_experiences (name, slug, created_by, persona_config, session_config, access_config, observability_config) VALUES ('${slug}', '${slug}', '${U}', '{}', '{}', '{}', '{}');`;
const search = (slug: string) =>
  `INSERT INTO search_experiences (name, slug, search_config, ai_config, tools_config, created_by) VALUES ('${slug}', '${slug}', '{}', '{}', '{}', '${U}');`;
const registry = (key: string) =>
  `INSERT INTO seed_registry (id, seed_type, seed_key, checksum) VALUES ((SELECT COALESCE(MAX(id), 0) + 1 FROM seed_registry), 'docs', '${key}', 'c');`;

async function builtIn(client: PGlite) {
  const ai = await client.query<{ slug: string; is_built_in: boolean }>('SELECT slug, is_built_in FROM ai_experiences ORDER BY slug');
  const se = await client.query<{ slug: string; is_built_in: boolean }>('SELECT slug, is_built_in FROM search_experiences ORDER BY slug');
  return Object.fromEntries([...ai.rows.map((r) => [`chat:${r.slug}`, r.is_built_in]), ...se.rows.map((r) => [`search:${r.slug}`, r.is_built_in])]);
}

describe('migration 0037: built-in experiences', () => {
  it('marks the help experiences an earlier docs setup made, and nothing else', async () => {
    const client = await migrated([
      chat('help-assistant'), chat('shop-assistant'), search('interakt-docs'), search('catalog'),
      registry('interakt-docs'), registry('interakt-docs-search'),
    ].join('\n'));
    expect(await builtIn(client)).toEqual({
      'chat:help-assistant': true, 'chat:shop-assistant': false,
      'search:catalog': false, 'search:interakt-docs': true,
    });
  }, 60_000);

  it('marks nothing on an install where the docs setup never ran, even under the help slugs', async () => {
    const client = await migrated([chat('help-assistant'), search('interakt-docs')].join('\n'));
    expect(await builtIn(client)).toEqual({ 'chat:help-assistant': false, 'search:interakt-docs': false });
  }, 60_000);

  it('marks each help experience only by its own setup entry', async () => {
    const client = await migrated([chat('help-assistant'), search('interakt-docs'), registry('interakt-docs-search')].join('\n'));
    expect(await builtIn(client)).toEqual({ 'chat:help-assistant': false, 'search:interakt-docs': true });
  }, 60_000);
});
