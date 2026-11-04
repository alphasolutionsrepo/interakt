// src/features/document-indexing/document-indexer.embedding-failure.test.ts

/**
 * When the embedding model fails while indexing, each document is marked with the reason,
 * and the log says why with the model's error and its causes: the AI service passes the
 * failure on without logging it.
 */

import { describe, expect, it, vi } from 'vitest';

import { reported, type LogLine } from '@/shared/test/log-recorder';

const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
vi.mock('@/db/index', () => ({ db: {} }));
vi.mock('@/features/search/providers', () => ({ getSearchEngineProvider: vi.fn() }));
vi.mock('@/features/search-index/search-index-fields.service', () => ({}));
vi.mock('@/features/search-index/search-index-fields.repository', () => ({}));
const modelDown = vi.hoisted(() => new Error('model "nomic-embed-text" not found', { cause: new Error('404 from Ollama') }));
vi.mock('@/features/ai-service', () => ({ generateEmbeddings: vi.fn(async () => { throw modelDown; }) }));

import { generateDocumentEmbeddings } from './document-indexer.service';

describe('an embedding model that fails while indexing', () => {
    it('marks each document and logs the error itself, once', async () => {
        const result = await generateDocumentEmbeddings(
            [{ _id: 'a', name: 'Linen shirt' }],
            [{ fieldName: 'name' }] as never,
            { providerId: 'p', modelId: 1 } as never,
            'batch-1',
        );

        expect(result.errors).toEqual([{ documentIndex: 0, error: expect.stringContaining('not found') }]);
        expect(reported(logs)).toEqual([expect.objectContaining({ level: 'error', context: expect.objectContaining({ batchId: 'batch-1', err: modelDown }) })]);
    });
});
