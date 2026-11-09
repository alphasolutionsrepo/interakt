// src/features/document-indexing/embedding-warnings.test.ts

import { describe, expect, it } from 'vitest';

import { embeddingWarnings } from './embedding-warnings';

describe('embeddingWarnings', () => {
    it('says the embedding model failed, with its reason, rather than blaming the content', () => {
        expect(embeddingWarnings({ failed: 2, skipped: 0 }, 'Embedding failed: Rate limit reached for text-embedding-3-small'))
            .toEqual(['2 documents indexed without embeddings: the embedding model failed (Rate limit reached for text-embedding-3-small)']);
    });

    it('keeps documents without text apart from failures', () => {
        expect(embeddingWarnings({ failed: 1, skipped: 2 })).toEqual([
            '1 documents indexed without embeddings: the embedding model failed',
            '2 documents indexed without embeddings (no vector source content)',
        ]);
    });

    it('removes credentials from the reason', () => {
        const [warning] = embeddingWarnings({ failed: 1, skipped: 0 }, 'Embedding failed: 401 Incorrect API key provided: sk-proj-abcdefghijklmnopqrstuvwxyz123456');
        expect(warning).not.toContain('sk-proj-abcdefghijklmnopqrstuvwxyz123456');
    });

    it('has nothing to say when every document got its embedding', () => {
        expect(embeddingWarnings({ failed: 0, skipped: 0 })).toEqual([]);
    });
});
