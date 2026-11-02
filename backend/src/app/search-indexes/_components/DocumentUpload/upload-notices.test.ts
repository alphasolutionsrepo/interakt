// src/app/search-indexes/_components/DocumentUpload/upload-notices.test.ts

import { describe, expect, it } from 'vitest';

import { uploadNotice, uploadProgressState } from './upload-notices';

const embeddings = (generated: number, skipped: number, failed = 0) => ({ enabled: true, generated, failed, skipped });

describe('uploadProgressState', () => {
    it('is partial when the upload finished with some documents rejected', () => {
        expect(uploadProgressState({ status: 'completed', progress: { total: 2, indexed: 1, failed: 1 } } as never)).toBe('partial');
        expect(uploadProgressState({ status: 'completed', progress: { total: 2, indexed: 2, failed: 0 } } as never)).toBe('completed');
        expect(uploadProgressState({ status: 'failed', progress: { total: 2, indexed: 0, failed: 2 } } as never)).toBe('failed');
    });
});

describe('uploadNotice', () => {
    it('shows a clean upload with the embedding count once, from the server message', () => {
        const message = 'Successfully indexed 2 documents (2 embeddings generated)';
        expect(uploadNotice({ success: true, message, embeddingStats: embeddings(2, 0) })).toEqual({
            message,
            description: 'Embeddings: 2 generated, 0 skipped',
        });
    });

    it('counts failed embeddings in the description', () => {
        expect(uploadNotice({ success: true, message: 'Successfully indexed 3 documents', embeddingStats: embeddings(1, 1, 1) })?.description)
            .toBe('Embeddings: 1 generated, 1 failed, 1 skipped');
    });

    it('says nothing about a failed or partial upload: the Activity panel reports it', () => {
        expect(uploadNotice({ success: false, message: 'Indexing completed with 1 failures', embeddingStats: embeddings(1, 0) })).toBeUndefined();
    });
});
