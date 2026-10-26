// src/features/tools/executors/data-source/file-store.lookup.test.ts

/**
 * Find Record on uploaded files answers a chunk id that doesn't exist, or belongs to another
 * data source, the way search-index lookups do: "not found", not a failed call.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('@/shared/logger/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('@/features/embedding/embedding.service', () => ({ embed: vi.fn() }));
const { getChunkById } = vi.hoisted(() => ({ getChunkById: vi.fn() }));
vi.mock('@/features/knowledge-base/knowledge-base.repository', () => ({ getChunkById }));

import { executeFileStoreLookup } from './file-store';

const CHUNK_1 = '6f1c2a3e-9b4d-4c1e-8a2f-0d3b5e7f9a11';
const CHUNK_9 = '00000000-0000-4000-8000-000000000009';
const notFound = (requested: string) => ({
  success: true,
  data: { found: false, requested, message: `No record matches "${requested}".` },
});

describe('file-store Find Record', () => {
  it('returns the chunk with that id', async () => {
    getChunkById.mockResolvedValueOnce({ id: CHUNK_1, dataSourceId: 'ds', content: 'Text', chunkIndex: 0, documentId: 'd1' });

    const result = await executeFileStoreLookup('ds', {}, { id: CHUNK_1 });

    expect(result).toMatchObject({ success: true, data: { document: { id: CHUNK_1, content: 'Text' } } });
  });

  it('answers not found for a chunk id that does not exist', async () => {
    getChunkById.mockResolvedValueOnce(null);

    expect(await executeFileStoreLookup('ds', {}, { id: CHUNK_9 })).toEqual(notFound(CHUNK_9));
  });

  it("answers not found for a chunk of another data source, without showing it", async () => {
    getChunkById.mockResolvedValueOnce({ id: CHUNK_1, dataSourceId: 'other', content: 'Secret', chunkIndex: 0, documentId: 'd1' });

    expect(await executeFileStoreLookup('ds', {}, { id: CHUNK_1 })).toEqual(notFound(CHUNK_1));
  });

  it('answers not found for an id that cannot be a chunk id, without querying', async () => {
    getChunkById.mockClear();

    expect(await executeFileStoreLookup('ds', {}, { id: 'Getting started guide' })).toEqual(notFound('Getting started guide'));
    expect(getChunkById).not.toHaveBeenCalled();
  });

  it('takes a numeric id as text', async () => {
    expect(await executeFileStoreLookup('ds', {}, { id: 42 })).toEqual(notFound('42'));
  });
});
