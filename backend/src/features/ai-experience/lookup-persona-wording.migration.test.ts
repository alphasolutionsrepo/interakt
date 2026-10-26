// src/features/ai-experience/lookup-persona-wording.migration.test.ts

/**
 * Migration 0034 changes "look up specific items by ID" to "look up specific items" in the
 * sentence the create wizard wrote into an experience's instructions, for experiences with a
 * Find Record tool on a search index. Everything else in the instructions is kept.
 *
 * Runs the migration file on a real Postgres (PGlite).
 */

import { readFileSync } from 'fs';
import path from 'path';

import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const MIGRATION = readFileSync(path.join(__dirname, '../../../db/drizzle/0034_lookup_persona_wording.sql'), 'utf8');

const generated = (lookup: string) =>
  `You are the AI assistant for "Shop". When users ask questions, use your tools to search for relevant results, ${lookup}, `
  + 'inspect available data fields. Always present real data from tool results — never make up information.';
const OLD = generated('look up specific items by ID');
const NEW = generated('look up specific items');
const LAST_IN_LIST = 'When users ask questions, use your tools to search for relevant results, look up specific items by ID. Be brief.';
const ADMIN_WROTE = 'Always look up specific items by ID before answering.';
const persona = (systemInstructions: string) => ({
  tone: 'friendly',
  systemInstructions,
  responseFormats: { enabledPresets: ['rich_text', 'single_card'], defaultPreset: 'rich_text' },
});

const SOURCES = [
  { id: 'catalog', type: 'search_index' },
  { id: 'shop', type: 'search_index_external' },
  { id: 'docs', type: 'file_store' },
];
const TOOLS = [
  { id: 'catalogFind', source: 'catalog', operation: 'lookup' },
  { id: 'shopFind', source: 'shop', operation: 'lookup' },
  { id: 'docsFind', source: 'docs', operation: 'lookup' },
  { id: 'catalogSearch', source: 'catalog', operation: 'search' },
];
const EXPERIENCES = [
  { id: 'managed', persona: persona(OLD), tools: ['catalogSearch', 'catalogFind'] },
  { id: 'external', persona: persona(OLD), tools: ['shopFind'] },
  { id: 'lastInList', persona: persona(LAST_IN_LIST), tools: ['catalogFind'] },
  { id: 'fileStoreOnly', persona: persona(OLD), tools: ['docsFind'] },
  { id: 'noLookup', persona: persona(OLD), tools: ['catalogSearch'] },
  { id: 'adminWrote', persona: persona(ADMIN_WROTE), tools: ['catalogFind'] },
  { id: 'noPersona', persona: null, tools: ['catalogFind'] },
];

const db = new PGlite();

async function personaOf(id: string) {
  const { rows } = await db.query<{ persona_config: unknown }>('SELECT persona_config FROM ai_experiences WHERE id = $1', [id]);
  return rows[0].persona_config;
}

beforeAll(async () => {
  await db.exec(`
    CREATE TABLE data_sources (id text PRIMARY KEY, type text);
    CREATE TABLE tools (id text PRIMARY KEY, data_source_id text, operation text);
    CREATE TABLE ai_experiences (id text PRIMARY KEY, persona_config json);
    CREATE TABLE ai_experience_tools (ai_experience_id text, tool_id text);
  `);
  for (const s of SOURCES) await db.query('INSERT INTO data_sources VALUES ($1, $2)', [s.id, s.type]);
  for (const t of TOOLS) await db.query('INSERT INTO tools VALUES ($1, $2, $3)', [t.id, t.source, t.operation]);
  for (const e of EXPERIENCES) {
    await db.query('INSERT INTO ai_experiences VALUES ($1, $2)', [e.id, e.persona && JSON.stringify(e.persona)]);
    for (const tool of e.tools) await db.query('INSERT INTO ai_experience_tools VALUES ($1, $2)', [e.id, tool]);
  }
  for (const statement of MIGRATION.split('--> statement-breakpoint')) await db.exec(statement);
});

afterAll(async () => {
  await db.close();
});

describe('migration 0034: Find Record wording in experience instructions', () => {
  it('drops "by ID" from the generated sentence and keeps the rest of the persona', async () => {
    expect(await personaOf('managed')).toEqual(persona(NEW));
    expect(await personaOf('external')).toEqual(persona(NEW));
  });

  it('changes the phrase when it ends the list', async () => {
    expect(await personaOf('lastInList')).toEqual(
      persona('When users ask questions, use your tools to search for relevant results, look up specific items. Be brief.'),
    );
  });

  it('keeps "by ID" for file-store lookups, which take an id only, and where there is no lookup', async () => {
    expect(await personaOf('fileStoreOnly')).toEqual(persona(OLD));
    expect(await personaOf('noLookup')).toEqual(persona(OLD));
  });

  it('keeps instructions an admin wrote outside the generated sentence', async () => {
    expect(await personaOf('adminWrote')).toEqual(persona(ADMIN_WROTE));
    expect(await personaOf('noPersona')).toBeNull();
  });
});
