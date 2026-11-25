// src/features/knowledge-base/knowledge-base.service.upload.test.ts

/**
 * Uploaded text is composed (NFC) before it is chunked, so the chunks, their embeddings and
 * the stored rows all see the same text.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/embedding/embedding.service', () => ({
  embedBatch: vi.fn(async (texts: string[]) => texts.map(() => [0.1])),
}));
vi.mock('./knowledge-base.repository', () => ({
  createDocument: vi.fn(async (d: Record<string, unknown>) => ({ id: 'doc-1', ...d })),
  createChunks: vi.fn(async () => undefined),
  updateDocumentStatus: vi.fn(async () => undefined),
}));

import { embedBatch } from '@/features/embedding/embedding.service';

import * as repository from './knowledge-base.repository';
import { uploadDocument } from './knowledge-base.service';

describe('uploadDocument', () => {
  beforeEach(() => vi.clearAllMocks());

  it('composes decomposed accents before chunking and embedding', async () => {
    const composed = 'Gusseisentöpfe in drei Farben. Kaffeebecher aus Glas.';
    const decomposed = composed.normalize('NFD');
    expect(decomposed).not.toBe(composed);

    await uploadDocument({ dataSourceId: 'ds-1', name: 'katalog.txt', content: decomposed });

    const embedded = vi.mocked(embedBatch).mock.calls[0][0] as string[];
    expect(embedded.length).toBeGreaterThan(0);
    for (const text of embedded) expect(text).toBe(text.normalize('NFC'));
    expect(embedded.join(' ')).toContain('Gusseisentöpfe');

    const rows = vi.mocked(repository.createChunks).mock.calls[0][0];
    expect(rows.map((r) => r.content)).toEqual(embedded);
  });
});
