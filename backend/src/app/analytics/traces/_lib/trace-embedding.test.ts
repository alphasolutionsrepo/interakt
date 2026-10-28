// src/app/analytics/traces/_lib/trace-embedding.test.ts

import { describe, it, expect } from 'vitest';

import { isSearchQueryEmbedding } from './trace-embedding';

describe('pairing embeddings with searches in a trace', () => {
  it("pairs a search query's embedding, and one with no feature recorded", () => {
    expect(['search_query', 'knowledge_search', undefined].map(isSearchQueryEmbedding)).toEqual([true, true, true]);
  });

  it('leaves out the turn’s other embeddings, by any name', () => {
    expect(['session_message', 'embedding_service', 'topic_gate', 'memory_retrieval', 'episodic_memory'].map(isSearchQueryEmbedding))
      .toEqual([false, false, false, false, false]);
  });
});
