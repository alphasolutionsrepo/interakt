import { describe, expect, it } from 'vitest';

import { hintFor, redactSecrets, serializeError, toErrorDetail } from './error-detail';

/** Shaped like @azure/core-rest-pipeline's RestError */
function azureRestError() {
    const err = new Error('The request is invalid. Details: definition : The vector field dimensions 1536 does not match 3072.') as Error & Record<string, unknown>;
    err.name = 'RestError';
    err.code = 'InvalidRequestParameter';
    err.statusCode = 400;
    err.request = { headers: { 'api-key': 'super-secret' } };
    err.response = { status: 400, bodyAsText: JSON.stringify({ error: { code: 'InvalidRequestParameter', message: 'dimensions mismatch' } }) };
    return err;
}

describe('toErrorDetail', () => {
    it('keeps status, code and the provider body of an Azure error', () => {
        const detail = toErrorDetail(azureRestError());
        expect(detail.statusCode).toBe(400);
        expect(detail.code).toBe('InvalidRequestParameter');
        expect(detail.details).toEqual({ error: { code: 'InvalidRequestParameter', message: 'dimensions mismatch' } });
        expect(detail.hint).toMatch(/vector size/);
    });

    it('reads status and body through a wrapping error', () => {
        const wrapped = new Error('Reindex failed: Failed to create index', { cause: azureRestError() });
        const detail = toErrorDetail(wrapped);
        expect(detail.message).toBe('Reindex failed: Failed to create index');
        expect(detail.statusCode).toBe(400);
        expect(detail.causes?.[0]).toMatch(/vector field dimensions/);
    });

    it('reads Elasticsearch errors from meta.body', () => {
        const err = Object.assign(new Error('index_not_found_exception'), {
            meta: { statusCode: 404, body: { error: { type: 'index_not_found_exception', reason: 'no such index [x]' } } },
        });
        const detail = toErrorDetail(err);
        expect(detail.statusCode).toBe(404);
        expect(detail.details).toEqual({ type: 'index_not_found_exception', reason: 'no such index [x]' });
        expect(detail.hint).toMatch(/Recreate Index/);
    });

    it('reads AdapterError fields', () => {
        const err = Object.assign(new Error('Rate limit reached'), { name: 'AdapterError', providerKey: 'openai', statusCode: 429, retryable: true });
        const detail = toErrorDetail(err);
        expect(detail).toMatchObject({ provider: 'openai', statusCode: 429, retryable: true });
        expect(detail.hint).toMatch(/Wait a minute/);
    });

    it('handles non-errors', () => {
        expect(toErrorDetail('boom')).toEqual({ message: 'boom' });
        expect(toErrorDetail(undefined)).toEqual({ message: 'Unknown error' });
    });
});

describe('hintFor', () => {
    it('recognises credentials, connectivity and server errors', () => {
        expect(hintFor({ message: 'x', statusCode: 403 })).toMatch(/credentials/);
        expect(hintFor({ message: 'connect ECONNREFUSED 127.0.0.1:9200' })).toMatch(/couldn't be reached/);
        expect(hintFor({ message: 'x', statusCode: 503 })).toMatch(/Trying again/);
        expect(hintFor({ message: 'something unusual' })).toBeUndefined();
    });
});

describe('redactSecrets', () => {
    it('redacts secret keys but keeps counts', () => {
        expect(redactSecrets({ apiKey: 'a', 'x-api-key': 'b', accessToken: 'c', clientSecret: 'd', tokens: 120, maxTokens: 5, nested: { password: 'e' } })).toEqual({
            apiKey: '[Redacted]',
            'x-api-key': '[Redacted]',
            accessToken: '[Redacted]',
            clientSecret: '[Redacted]',
            tokens: 120,
            maxTokens: 5,
            nested: { password: '[Redacted]' },
        });
    });

    it('cuts long strings and survives cycles', () => {
        const a: Record<string, unknown> = { text: 'x'.repeat(5000) };
        a.self = a;
        const out = redactSecrets(a) as Record<string, unknown>;
        expect((out.text as string).length).toBeLessThan(4100);
        expect(out.self).toBe('[Circular]');
    });
});

describe('serializeError', () => {
    it('leaves out the request and its credentials', () => {
        const out = serializeError(azureRestError());
        expect(out).toMatchObject({ name: 'RestError', code: 'InvalidRequestParameter', statusCode: 400 });
        expect(JSON.stringify(out)).not.toContain('super-secret');
    });
});
