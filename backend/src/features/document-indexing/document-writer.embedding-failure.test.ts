// src/features/document-indexing/document-writer.embedding-failure.test.ts

/**
 * When the embedding model fails on a document write, the documents are refused with the
 * reason, and the model's error (with its causes) is passed on for the write's one log
 * line, which the answer writes with its request id: neither the AI service nor the
 * writer logs it.
 */

import { describe, expect, it, vi } from 'vitest';

import { reported, type LogLine } from '@/shared/test/log-recorder';

const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
vi.mock('@/db/index', () => {
  const row = { id: 'idx', name: 'products', searchProvider: 'elasticsearch', searchType: 'semantic', aiProviderId: 'p', aiModelId: 1 };
  return { db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => [row] }) }) }) } };
});
const provider = vi.hoisted(() => ({ indexExists: async () => true, bulkWrite: vi.fn(async () => ({ indexed: 0, failed: 0, errors: [] })) }));
vi.mock('@/features/search/providers', () => ({ getSearchEngineProvider: () => provider }));
vi.mock('@/features/search-index/search-index-fields.service', () => ({ getFieldsBySearchIndexId: async () => [{ fieldName: 'name', sourceFieldName: 'name', sourceFieldPath: 'name', fieldType: 'text' }] }));
vi.mock('@/features/search-index/search-index-fields.repository', () => ({ getVectorSourceFields: async () => [{ fieldName: 'name' }] }));
const modelDown = vi.hoisted(() => new Error('model "nomic-embed-text" not found', { cause: new Error('404 from Ollama') }));
vi.mock('@/features/ai-service', () => ({ generateEmbeddings: vi.fn(async () => { throw modelDown; }) }));

import { writeDocuments } from './document-writer.service';

describe('an embedding model that fails on a document write', () => {
  it('refuses the document and passes the error on, without logging it', async () => {
    const result = await writeDocuments('idx', [{ action: 'upload', documentId: 'a', document: { name: 'Linen shirt' } }] as never);

    expect(result.errors).toEqual([expect.objectContaining({ operationIndex: 0, error: expect.stringContaining('not found') })]);
    expect(result.embeddingError).toBe(modelDown);
    expect(reported(logs)).toEqual([]);
  });
});
