// src/features/search-index/search-index.job-error.test.ts

/**
 * A failed reindex shows one request id: the one on the index page (the job record)
 * is the one in the error response and its log line, with tracing off.
 */

import { errors as esErrors } from '@elastic/elasticsearch';
import { describe, expect, it } from 'vitest';

import { jobError } from './search-index.service';

import { apiResponse } from '@/shared/api/response';

describe('jobError', () => {
    it('records the request id the error response will show', async () => {
        const providerError = new esErrors.ConnectionError('', { body: null, statusCode: 0, headers: {}, meta: {}, warnings: null } as never);
        const recorded = jobError(providerError);
        // What the reindex route answers: the same failure, wrapped
        const res = apiResponse.error(new Error('Reindex failed: ', { cause: providerError }));
        const body = await res.json();
        expect(recorded.requestId).toBe(body.requestId);
        expect(recorded).toMatchObject({ code: 'UPSTREAM_UNAVAILABLE', message: "Elasticsearch couldn't be reached." });
    });
});
