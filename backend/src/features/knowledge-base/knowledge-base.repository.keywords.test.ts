// src/features/knowledge-base/knowledge-base.repository.keywords.test.ts

/**
 * Keyword search terms keep letters outside a-z whole, and the terms find chunks on real
 * Postgres (PGlite with the main migrations).
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createAppTestDb, type AppTestDb } from '@/shared/test/app-test-db';

let testDb: AppTestDb;
vi.mock('@/db/index', () => ({
  get db() {
    return testDb.db;
  },
}));

import { dataSources, knowledgeChunks, knowledgeDocuments } from '../../../db/schema';

import { keywordSearchChunks, keywordTermsFrom } from './knowledge-base.repository';

describe('keywordTermsFrom', () => {
  it('keeps Danish words whole', () => {
    const terms = keywordTermsFrom('Hvor kan jeg købe smørrebrød på Nørrebro?');
    expect(terms).toContain('smørrebrød');
    expect(terms).toContain('nørrebro');
    expect(terms).not.toContain('rrebro');
  });

  it('keeps Norwegian words whole', () => {
    const terms = keywordTermsFrom('Hvordan søker jeg etter blåbærsyltetøy på nettbutikken?');
    expect(terms).toEqual(expect.arrayContaining(['søker', 'blåbærsyltetøy', 'nettbutikken', 'hvordan']));
    expect(terms).not.toContain('gskolen');
  });

  it('keeps German and French words whole', () => {
    expect(keywordTermsFrom('Wie groß ist die Prüfungsgebühr für Übungen?')).toEqual(
      expect.arrayContaining(['prüfungsgebühr', 'übungen', 'groß']),
    );
    expect(keywordTermsFrom('Où trouver la bibliothèque université?')).toEqual(
      expect.arrayContaining(['bibliothèque', 'université']),
    );
  });

  it('keeps a word whole when its accent is typed as a separate mark', () => {
    // "Prüfung" with u + U+0308 (decomposed), as some keyboards and pasted text produce it
    const decomposed = 'Prüfung der Bücher'.normalize('NFD');
    expect(keywordTermsFrom(decomposed)).toEqual(expect.arrayContaining(['prüfung', 'bücher']));
  });

  it('gives the same terms as before for English', () => {
    expect(keywordTermsFrom('how do I stop my assistant answering off-topic questions?')).toEqual([
      'assistant',
      'answering',
      'off-topic',
      'questions',
      'stop',
    ]);
  });
});

describe('keywordSearchChunks with non-ASCII terms', () => {
  beforeAll(async () => {
    testDb = await createAppTestDb();
  }, 30_000);
  afterAll(async () => {
    await testDb.close();
  });

  it('finds the chunk with "smørrebrød" and not one that only shares a fragment of it', async () => {
    const [source] = await testDb.db
      .insert(dataSources)
      .values({ name: 'Kb', slug: 'kb-danish', type: 'file_store', config: {} } as never)
      .returning();
    const [doc] = await testDb.db
      .insert(knowledgeDocuments)
      .values({ dataSourceId: source.id, name: 'guide.txt', status: 'ready' })
      .returning();
    await testDb.db.insert(knowledgeChunks).values([
      { documentId: doc.id, dataSourceId: source.id, chunkIndex: 0, content: 'En klassisk smørrebrød opskrift.' },
      { documentId: doc.id, dataSourceId: source.id, chunkIndex: 1, content: 'Metrostationen på Nørrebro er åben.' },
    ]);

    const rows = await keywordSearchChunks(source.id, 'smørrebrød opskrift');
    expect(rows.map((r) => r.chunkIndex)).toEqual([0]);
  });

  it('matches a capitalised non-ASCII word in any letter case', async () => {
    const [source] = await testDb.db
      .insert(dataSources)
      .values({ name: 'Kb', slug: 'kb-case', type: 'file_store', config: {} } as never)
      .returning();
    const [doc] = await testDb.db
      .insert(knowledgeDocuments)
      .values({ dataSourceId: source.id, name: 'butik.txt', status: 'ready' })
      .returning();
    await testDb.db.insert(knowledgeChunks).values([
      { documentId: doc.id, dataSourceId: source.id, chunkIndex: 0, content: 'Østerbro-butikken har ÆBLEMOST på lager.' },
      { documentId: doc.id, dataSourceId: source.id, chunkIndex: 1, content: 'Vesterbro-butikken har kaffe.' },
    ]);

    const rows = await keywordSearchChunks(source.id, 'æblemost østerbro-butikken');
    expect(rows.map((r) => r.chunkIndex)).toEqual([0]);
  });

  it('finds a chunk stored with decomposed accents', async () => {
    const [source] = await testDb.db
      .insert(dataSources)
      .values({ name: 'Kb', slug: 'kb-nfd', type: 'file_store', config: {} } as never)
      .returning();
    const [doc] = await testDb.db
      .insert(knowledgeDocuments)
      .values({ dataSourceId: source.id, name: 'katalog.txt', status: 'ready' })
      .returning();
    await testDb.db.insert(knowledgeChunks).values([
      { documentId: doc.id, dataSourceId: source.id, chunkIndex: 0, content: 'Gusseisentöpfe in drei Farben.'.normalize('NFD') },
      { documentId: doc.id, dataSourceId: source.id, chunkIndex: 1, content: 'Kaffeebecher aus Glas.' },
    ]);

    const rows = await keywordSearchChunks(source.id, 'gusseisentöpfe');
    expect(rows.map((r) => r.chunkIndex)).toEqual([0]);
  });
});
