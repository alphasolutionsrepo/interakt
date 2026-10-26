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

const notFound = (requested: string) => ({
  success: true,
  data: { found: false, requested, message: `No record matches "${requested}".` },
});

describe('file-store Find Record', () => {
  it('returns the chunk with that id', async () => {
    getChunkById.mockResolvedValueOnce({ id: 'c1', dataSourceId: 'ds', content: 'Text', chunkIndex: 0, documentId: 'd1' });

    const result = await executeFileStoreLookup('ds', {}, { id: 'c1' });

    expect(result).toMatchObject({ success: true, data: { document: { id: 'c1', content: 'Text' } } });
  });

  it('answers not found for a chunk id that does not exist', async () => {
    getChunkById.mockResolvedValueOnce(null);

    expect(await executeFileStoreLookup('ds', {}, { id: 'c9' })).toEqual(notFound('c9'));
  });

  it("answers not found for a chunk of another data source, without showing it", async () => {
    getChunkById.mockResolvedValueOnce({ id: 'c1', dataSourceId: 'other', content: 'Secret', chunkIndex: 0, documentId: 'd1' });

    expect(await executeFileStoreLookup('ds', {}, { id: 'c1' })).toEqual(notFound('c1'));
  });

  it('takes a numeric id as text', async () => {
    getChunkById.mockResolvedValueOnce(null);

    expect(await executeFileStoreLookup('ds', {}, { id: 42 })).toEqual(notFound('42'));
    expect(getChunkById).toHaveBeenLastCalledWith('42');
  });
});
