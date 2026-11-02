// src/app/search-indexes/_components/DocumentUpload/upload-notices.test.ts

import { describe, expect, it } from 'vitest';

import { uploadNotice, uploadProgressState } from './upload-notices';

const embeddings = (generated: number, skipped: number) => ({ enabled: true, generated, failed: 0, skipped });

describe('uploadProgressState', () => {
    it('is partial when the upload finished with some documents rejected', () => {
        expect(uploadProgressState({ status: 'completed', progress: { total: 2, indexed: 1, failed: 1 } } as never)).toBe('partial');
        expect(uploadProgressState({ status: 'completed', progress: { total: 2, indexed: 2, failed: 0 } } as never)).toBe('completed');
        expect(uploadProgressState({ status: 'failed', progress: { total: 2, indexed: 0, failed: 2 } } as never)).toBe('failed');
    });
});

describe('uploadNotice', () => {
    it('celebrates a clean upload with its embeddings', () => {
        // The message as the server writes it, embedding count included
        const message = 'Successfully indexed 2 documents (2 embeddings generated)';
        expect(uploadNotice({ success: true, message, embeddingStats: embeddings(2, 0) })).toEqual({
            kind: 'success',
            message: `${message}\n✨ 2 embeddings generated`,
            description: 'Embeddings: 2 generated, 0 skipped',
        });
    });

    it('says nothing good about a failed or partial upload: the Activity panel reports it', () => {
        expect(uploadNotice({ success: false, message: 'Indexing completed with 1 failures', embeddingStats: embeddings(1, 0) })).toBeUndefined();
        expect(uploadNotice({ success: false, message: 'Indexing completed with 2 failures' })).toBeUndefined();
    });

    it('still warns when no embeddings were made', () => {
        expect(uploadNotice({ success: false, message: 'x', embeddingStats: embeddings(0, 3) }))
            .toEqual({ kind: 'warning', message: '⚠️ No embeddings generated (3 skipped)' });
    });
});
