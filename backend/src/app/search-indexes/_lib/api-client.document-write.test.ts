// src/app/search-indexes/_lib/api-client.document-write.test.ts

/**
 * Deleting (or replacing, or updating) one document answers 207 when it wasn't
 * written, e.g. the search service couldn't be reached. The admin UI must not say
 * "Document deleted" then: the client throws it, explained, as a failed request.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { documentIndexingApi } from './api-client';

const answer = (status: number, data: unknown) => vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: true, data }), { status })));

afterEach(() => { vi.unstubAllGlobals(); });

describe('a write of one document', () => {
  it('that was not written is thrown with the explanation, hint and request id', async () => {
    answer(207, {
      success: false,
      message: "Elasticsearch couldn't be reached.",
      error: { code: 'WRITE_FAILED', message: "Elasticsearch couldn't be reached.", hint: 'Check that it is running.', requestId: 'r1' },
      summary: { total: 1, succeeded: 0, failed: 1, counts: { upload: 0, merge: 0, delete: 0 } },
      durationMs: 1,
    });
    await expect(documentIndexingApi.deleteDocument('i1', 'd1')).rejects.toMatchObject({
      name: 'ApiError', status: 207, code: 'WRITE_FAILED', message: "Elasticsearch couldn't be reached.", hint: 'Check that it is running.', requestId: 'r1',
    });
  });

  it('that was written comes back as it was', async () => {
    answer(200, { success: true, message: 'Document deleted', summary: { total: 1, succeeded: 1, failed: 0, counts: { upload: 0, merge: 0, delete: 1 } }, durationMs: 1 });
    expect(await documentIndexingApi.deleteDocument('i1', 'd1')).toMatchObject({ success: true, message: 'Document deleted' });
  });
});
