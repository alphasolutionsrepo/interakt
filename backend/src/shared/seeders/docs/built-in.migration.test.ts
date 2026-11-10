// src/shared/seeders/docs/built-in.migration.test.ts

/**
 * Migrations 0037 and 0038 add the "built in" mark. What an earlier docs setup made for the help
 * (its registry entry exists, under the names it uses) is marked: the two experiences, the docs
 * data source and its tools, the docs search index. Nothing else is, including a row that only
 * shares a name on an install where the setup never ran.
 *
 * Runs the migrations on a real Postgres (PGlite): everything before 0037, then the data, then the rest.
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
  const first = entries.findIndex((e) => e.tag === MIGRATION);
  for (const { tag } of entries.slice(0, first)) await client.exec(sqlOf(tag));
  await client.exec(data);
  for (const { tag } of entries.slice(first)) await client.exec(sqlOf(tag));
  return client;
}

const U = '00000000-0000-4000-8000-0000000000aa';
const chat = (slug: string) =>
  `INSERT INTO ai_experiences (name, slug, created_by, persona_config, session_config, access_config, observability_config) VALUES ('${slug}', '${slug}', '${U}', '{}', '{}', '{}', '{}');`;
const search = (slug: string) =>
  `INSERT INTO search_experiences (name, slug, search_config, ai_config, tools_config, created_by) VALUES ('${slug}', '${slug}', '{}', '{}', '{}', '${U}');`;
const dataSource = (slug: string) =>
  `INSERT INTO data_sources (name, slug, type, config) VALUES ('${slug}', '${slug}', 'file_store', '{}');`;
const toolOf = (slug: string, dataSourceSlug: string, isSystem = true) =>
  `INSERT INTO tools (name, slug, ai_description, data_source_id, is_system) VALUES ('${slug}', '${slug}', 'd', (SELECT id FROM data_sources WHERE slug = '${dataSourceSlug}'), ${isSystem});`;
const index = (name: string) =>
  `INSERT INTO search_index (name, display_name, search_type) VALUES ('${name}', '${name}', 'lexical');`;
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

  it('marks the docs data source, its tools and the docs index an earlier setup made, and nothing else', async () => {
    const client = await migrated([
      dataSource('interakt-docs'), dataSource('crm'),
      toolOf('interakt-docs-search', 'interakt-docs'), toolOf('crm-search', 'crm'),
      toolOf('my-docs-tool', 'interakt-docs', false), // someone added it by hand
      index('interakt-docs'), index('products'),
      registry('interakt-docs'), registry('interakt-docs-search'),
    ].join('\n'));
    const marked = async (table: string, key: string) =>
      Object.fromEntries((await client.query<{ k: string; b: boolean }>(`SELECT ${key} AS k, is_built_in AS b FROM ${table}`)).rows.map((r) => [r.k, r.b]));
    expect(await marked('data_sources', 'slug')).toEqual({ 'interakt-docs': true, crm: false });
    expect(await marked('tools', 'slug')).toEqual({ 'interakt-docs-search': true, 'crm-search': false, 'my-docs-tool': false });
    expect(await marked('search_index', 'name')).toEqual({ 'interakt-docs': true, products: false });
  }, 60_000);

  it('marks none of those where the docs setup never ran', async () => {
    const client = await migrated([dataSource('interakt-docs'), toolOf('interakt-docs-search', 'interakt-docs'), index('interakt-docs')].join('\n'));
    const count = async (table: string) => (await client.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table} WHERE is_built_in`)).rows[0].n;
    expect([await count('data_sources'), await count('tools'), await count('search_index')]).toEqual([0, 0, 0]);
  }, 60_000);
});
