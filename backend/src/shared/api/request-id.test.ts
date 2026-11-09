// src/shared/api/request-id.test.ts

/** With tracing off, one failure keeps one request id wherever it is reported */

import { trace } from '@opentelemetry/api';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { requestIdFor } from './request-id';
import { apiResponse } from './response';

describe('requestIdFor', () => {
    it('gives a failure the same id each time, also through the errors that wrap it', () => {
        const providerError = new Error('connect ECONNREFUSED');
        const id = requestIdFor(providerError);
        expect(requestIdFor(providerError)).toBe(id);
        expect(requestIdFor(new Error('Reindex failed', { cause: providerError }))).toBe(id);
    });

    it('gives different failures different ids', () => {
        expect(requestIdFor(new Error('a'))).not.toBe(requestIdFor(new Error('b')));
    });

    it('answers with the id a job recorded for the same failure', async () => {
        const providerError = new Error('connect ECONNREFUSED');
        const recorded = requestIdFor(providerError);   // what jobError stores on the index
        const res = apiResponse.error(new Error('Reindex failed', { cause: providerError }));
        expect((await res.json()).requestId).toBe(recorded);
    });

    it('with tracing on, gives each request its own trace id, even for a shared error', () => {
        const shared = new Error('cached lookup failed');
        const span = (traceId: string) => ({ spanContext: () => ({ traceId }) }) as never;
        const active = vi.spyOn(trace, 'getActiveSpan');
        active.mockReturnValue(span('a'.repeat(32)));
        expect(requestIdFor(shared)).toBe('a'.repeat(32));
        active.mockReturnValue(span('b'.repeat(32)));
        expect(requestIdFor(shared)).toBe('b'.repeat(32));
    });
});

afterEach(() => vi.restoreAllMocks());
