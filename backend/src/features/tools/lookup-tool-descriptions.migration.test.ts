// src/features/tools/lookup-tool-descriptions.migration.test.ts

/**
 * Migration 0033 gives Find Record tools on a search index the description and input schema
 * that new tools get: an id, a SKU or a name. Only exact copies of the old generated text are
 * replaced; anything an admin wrote, and file-store lookups, keep theirs.
 *
 * Runs the migration file on a real Postgres (PGlite).
 */

import { readFileSync } from 'fs';
import path from 'path';

import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { generateToolDescription } from './tools.description-generator';

const MIGRATION = readFileSync(path.join(__dirname, '../../../db/drizzle/0033_lookup_tool_descriptions.sql'), 'utf8');

const schemaWith = (description: string) => ({
  type: 'object',
  properties: { id: { type: 'string', description } },
  required: ['id'],
});
const EXECUTOR_DEFAULT = schemaWith('The unique identifier of the document to retrieve');
const WIZARD_DEFAULT = schemaWith('The unique identifier of the document');
const OLD_MANAGED = (name: string) =>
  `Look up a specific item by ID from "${name}". Use this when you have a specific document ID and need its full details.`;
const OLD_EXTERNAL = (name: string) => `Look up a specific document by ID from the external "${name}" index.`;

const SOURCES = [
  { id: 'catalog', type: 'search_index', name: 'Fashion Catalog' },
  { id: 'renamed', type: 'search_index', name: 'Catalog (new name)' },
  { id: 'shop', type: 'search_index_external', name: 'Shop' },
  { id: 'docs', type: 'file_store', name: 'Docs' },
];

const TOOLS = [
  { id: 'managedDefault', source: 'catalog', operation: 'lookup', description: OLD_MANAGED('Fashion Catalog'), schema: EXECUTOR_DEFAULT },
  { id: 'adminWrote', source: 'catalog', operation: 'lookup', description: 'Fetch a product by its handle.', schema: WIZARD_DEFAULT },
  { id: 'adminSchema', source: 'catalog', operation: 'lookup', description: OLD_MANAGED('Fashion Catalog'), schema: schemaWith('A product handle') },
  { id: 'oldName', source: 'renamed', operation: 'lookup', description: OLD_MANAGED('Fashion Catalog'), schema: EXECUTOR_DEFAULT },
  { id: 'externalDefault', source: 'shop', operation: 'lookup', description: OLD_EXTERNAL('Shop'), schema: EXECUTOR_DEFAULT },
  { id: 'fileStore', source: 'docs', operation: 'lookup', description: 'Look up a specific document or chunk by ID from "Docs".', schema: EXECUTOR_DEFAULT },
  { id: 'searchTool', source: 'catalog', operation: 'search', description: OLD_MANAGED('Fashion Catalog'), schema: EXECUTOR_DEFAULT },
];

const db = new PGlite();

async function tool(id: string) {
  const { rows } = await db.query<{ ai_description: string; input_schema: unknown }>(
    'SELECT ai_description, input_schema FROM tools WHERE id = $1',
    [id],
  );
  return rows[0];
}

beforeAll(async () => {
  await db.exec(`
    CREATE TABLE data_sources (id text PRIMARY KEY, type text, name varchar);
    CREATE TABLE tools (id text PRIMARY KEY, data_source_id text, operation text, ai_description text, input_schema json);
  `);
  for (const s of SOURCES) await db.query('INSERT INTO data_sources VALUES ($1, $2, $3)', [s.id, s.type, s.name]);
  for (const t of TOOLS) {
    await db.query('INSERT INTO tools VALUES ($1, $2, $3, $4, $5)', [t.id, t.source, t.operation, t.description, JSON.stringify(t.schema)]);
  }
  for (const statement of MIGRATION.split('--> statement-breakpoint')) await db.exec(statement);
});

afterAll(async () => {
  await db.close();
});

describe('migration 0033: Find Record descriptions', () => {
  const managed = generateToolDescription('Fashion Catalog', 'search_index', 'lookup');
  const external = generateToolDescription('Shop', 'search_index_external', 'lookup');

  it('gives an untouched managed-index lookup what a new tool gets', async () => {
    expect(await tool('managedDefault')).toEqual({ ai_description: managed.aiDescription, input_schema: managed.inputSchema });
  });

  it('gives an untouched external-index lookup what a new tool gets', async () => {
    expect(await tool('externalDefault')).toEqual({ ai_description: external.aiDescription, input_schema: external.inputSchema });
  });

  it('keeps a description an admin wrote, and updates the default schema next to it', async () => {
    expect(await tool('adminWrote')).toEqual({ ai_description: 'Fetch a product by its handle.', input_schema: managed.inputSchema });
  });

  it('keeps a schema an admin changed, and updates the default description next to it', async () => {
    expect(await tool('adminSchema')).toEqual({ ai_description: managed.aiDescription, input_schema: schemaWith('A product handle') });
  });

  it('keeps a description generated under an earlier data source name', async () => {
    expect((await tool('oldName')).ai_description).toBe(OLD_MANAGED('Fashion Catalog'));
  });

  it('keeps file-store lookups, which take an id only', async () => {
    expect(await tool('fileStore')).toEqual({
      ai_description: 'Look up a specific document or chunk by ID from "Docs".',
      input_schema: EXECUTOR_DEFAULT,
    });
  });

  it('leaves tools that are not lookups alone', async () => {
    expect(await tool('searchTool')).toEqual({ ai_description: OLD_MANAGED('Fashion Catalog'), input_schema: EXECUTOR_DEFAULT });
  });
});
