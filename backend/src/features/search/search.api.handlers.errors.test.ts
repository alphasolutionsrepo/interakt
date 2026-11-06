// src/features/search/search.api.handlers.errors.test.ts

/**
 * A failed admin search (index playground) says what went wrong: a provider failure is
 * explained from the provider's error, and text we don't recognise is never sent as is.
 */

import { errors as esErrors } from '@elastic/elasticsearch';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SearchError } from './search.types';

import { reported, type LogLine } from '@/shared/test/log-recorder';

const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));
const failWith = vi.hoisted(() => ({ error: undefined as unknown }));
vi.mock('@/features/global-settings', () => ({
    getGlobalSearchConfig: async () => ({ hybridDefaults: {}, timeout: { timeoutMs: 1000 } }),
}));
vi.mock('@/features/telemetry', () => ({ runWithTelemetryLevel: (_level: string, fn: () => unknown) => fn() }));
vi.mock('./search.service', () => ({
    searchById: vi.fn(async () => { throw failWith.error; }),
    searchByName: vi.fn(),
}));

import { handleSearchById } from './search.api.handlers';

async function search() {
    const res = await handleSearchById(
        new NextRequest('http://localhost/api/search', { method: 'POST', body: JSON.stringify({ query: 'linen shirt' }) }),
        { id: crypto.randomUUID() }
    );
    return { status: res.status, body: await res.json() };
}

const noResponse = { body: null, statusCode: 0, headers: {}, meta: {}, warnings: null } as never;

describe('admin search errors', () => {
    beforeEach(() => { failWith.error = undefined; logs.length = 0; });

    it('says Elasticsearch could not be reached, with what to try', async () => {
        failWith.error = new SearchError('', 'PROVIDER_ERROR', {}, { cause: new esErrors.ConnectionError('', noResponse) });
        const { status, body } = await search();
        expect(status).toBe(503);
        expect(body).toMatchObject({ code: 'UPSTREAM_UNAVAILABLE', message: "Elasticsearch couldn't be reached." });
        expect(body.hint).toMatch(/running/);
        // What Elasticsearch said, nothing of ours: no status (it never answered), no PROVIDER_ERROR
        expect(body.details).toEqual({ provider: 'Elasticsearch' });
        expect(body.requestId).toEqual(expect.any(String));
    });

    it('does not send provider text it does not recognise', async () => {
        failWith.error = new SearchError('connect failed https://elastic:Sup3rSecretPassw0rd@es.internal:9200', 'PROVIDER_ERROR');
        const { status, body } = await search();
        // A provider failure's status, with a generic message instead of the provider's text
        expect(status).toBe(503);
        expect(body.code).toBe('PROVIDER_ERROR');
        expect(JSON.stringify(body)).not.toContain('Sup3rSecret');
        expect(body.message).toMatch(/Something went wrong/);
    });

    it('answers a missing or unready index with its own status and code', async () => {
        failWith.error = new SearchError('Index "shop" not found', 'INDEX_NOT_FOUND');
        expect(await search()).toMatchObject({ status: 404, body: { code: 'INDEX_NOT_FOUND', message: 'Index "shop" not found' } });
        failWith.error = new SearchError('Search index "shop" is not active', 'INDEX_NOT_READY');
        expect(await search()).toMatchObject({ status: 503, body: { code: 'INDEX_NOT_READY', message: 'Search index "shop" is not active' } });
    });

    it('still shows what was wrong with the query', async () => {
        failWith.error = new SearchError('Unknown filter field "colour"', 'INVALID_FILTER');
        const { status, body } = await search();
        expect(status).toBe(400);
        expect(body.message).toBe('Unknown filter field "colour"');
    });

    it('logs a refused search once, as a warning with the request id', async () => {
        failWith.error = new SearchError('Unknown filter field "colour"', 'INVALID_FILTER');
        const { body } = await search();
        expect(reported(logs)).toEqual([expect.objectContaining({ level: 'warn', context: expect.objectContaining({ requestId: body.requestId, operation: 'searchById' }) })]);
    });

    it('logs a failure once, as an error with the request id', async () => {
        failWith.error = new SearchError('', 'PROVIDER_ERROR', {}, { cause: new esErrors.ConnectionError('', noResponse) });
        const { body } = await search();
        expect(reported(logs)).toEqual([expect.objectContaining({ level: 'error', context: expect.objectContaining({ requestId: body.requestId, operation: 'searchById' }) })]);
    });

});
