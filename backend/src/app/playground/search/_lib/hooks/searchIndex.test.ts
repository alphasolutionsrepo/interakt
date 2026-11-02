// src/app/playground/search/_lib/hooks/searchIndex.test.ts

/** A failed playground search says what went wrong and what to try, whatever the body is */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { searchExperience, searchIndex } from './useSearchPlayground';

import { ApiError } from '@/shared/api/api-error';

function respond(body: string, status: number, contentType = 'application/json') {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status, headers: { 'content-type': contentType } })));
}

afterEach(() => vi.unstubAllGlobals());

describe('searchIndex', () => {
    it('throws the error the API explained, with its hint', async () => {
        respond(JSON.stringify({
            success: false, code: 'UPSTREAM_UNAVAILABLE', message: "Elasticsearch couldn't be reached.",
            hint: 'Check that the service is running.', requestId: 'abc',
        }), 503);
        const err = await searchIndex('id', { query: 'linen shirt' }).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(ApiError);
        expect(err).toMatchObject({ message: "Elasticsearch couldn't be reached.", hint: 'Check that the service is running.', status: 503, requestId: 'abc' });
    });

    it('still explains a gateway page that is not JSON', async () => {
        respond('<html><body>502 Bad Gateway</body></html>', 502, 'text/html');
        const err = await searchIndex('id', { query: 'linen shirt' }).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(ApiError);
        expect((err as ApiError).message).toBe('Search failed (502)');
    });

    it('returns the results', async () => {
        respond(JSON.stringify({ success: true, data: { hits: [] } }), 200);
        expect(await searchIndex('id', { query: 'linen shirt' })).toEqual({ hits: [] });
    });
});

describe('searchExperience', () => {
    it('throws the error the public route answered with, request id included', async () => {
        respond(JSON.stringify({
            success: false, code: 'UPSTREAM_UNAVAILABLE', message: 'The service is temporarily unavailable. Try again in a moment.', requestId: 'r2',
        }), 503);
        const err = await searchExperience('catalog', { query: 'linen shirt' }).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(ApiError);
        expect(err).toMatchObject({ code: 'UPSTREAM_UNAVAILABLE', status: 503, requestId: 'r2' });
    });

    it('still explains a gateway page that is not JSON', async () => {
        respond('<html>502 Bad Gateway</html>', 502, 'text/html');
        const err = await searchExperience('catalog', { query: 'linen shirt' }).catch((e: unknown) => e);
        expect((err as ApiError).message).toBe('Search failed (502)');
    });

    it('posts to the experience and returns the results', async () => {
        respond(JSON.stringify({ success: true, data: { results: [] } }), 200);
        expect(await searchExperience('catalog', { query: 'linen shirt' })).toEqual({ results: [] });
        expect(vi.mocked(fetch).mock.calls[0][0]).toBe('/api/v1/search/catalog/search');
    });
});
