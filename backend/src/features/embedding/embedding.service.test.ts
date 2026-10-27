// src/features/embedding/embedding.service.test.ts

/**
 * The embedding helpers pass on what the caller says the embedding is for, so its AI usage row
 * and trace span carry the caller's feature (the type makes every caller name one).
 */

import { describe, it, expect, vi } from 'vitest';

const { generateEmbedding, generateEmbeddings } = vi.hoisted(() => ({
  generateEmbedding: vi.fn(async () => [0.1]),
  generateEmbeddings: vi.fn(async () => ({ embeddings: [{ index: 0, vector: [0.2] }] })),
}));
vi.mock('@/features/ai-service/ai-service.service', () => ({ generateEmbedding, generateEmbeddings }));

import { embed, embedBatch } from './embedding.service';

describe('embedding helpers', () => {
  it("pass the caller's feature on, with no default of their own", async () => {
    expect(await embed('navy sweaters', { feature: 'topic_gate' })).toEqual([0.1]);
    expect(await embedBatch(['returns'], { feature: 'knowledge_base' })).toEqual([[0.2]]);

    expect(generateEmbedding).toHaveBeenCalledWith('navy sweaters', { feature: 'topic_gate' });
    expect(generateEmbeddings).toHaveBeenCalledWith(['returns'], { feature: 'knowledge_base' });
  });
});
