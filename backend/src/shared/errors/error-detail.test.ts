import { describe, expect, it } from 'vitest';

import { redactSecrets, serializeError, toErrorDetail } from './error-detail';

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
    });

    it('reads AdapterError fields', () => {
        const err = Object.assign(new Error('Rate limit reached'), { name: 'AdapterError', providerKey: 'openai', statusCode: 429, retryable: true });
        const detail = toErrorDetail(err);
        expect(detail).toMatchObject({ provider: 'openai', statusCode: 429, retryable: true });
    });

    it('handles non-errors', () => {
        expect(toErrorDetail('boom')).toEqual({ message: 'boom' });
        expect(toErrorDetail(undefined)).toEqual({ message: 'Unknown error' });
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
    it('leaves out the request, response and query parameters an error carries, whatever their headers are called', () => {
        const err = Object.assign(new Error('rejected'), {
            detail: 'Key (id)=(1) is not present in table "t".',
            request: { headers: { 'Ocp-Apim-Subscription-Key': 'k-123' } },
            response: { status: 401 },
            headers: { 'X-Sitecore-Key': 'k-456' },
            config: { url: 'https://search.example', headers: { 'X-Custom-Key': 'k-789' } },
            options: { auth: 'k-000' },
            params: ['alice@example.com'],
        });
        const out = serializeError(err);

        expect(out.detail).toBe('Key (id)=(1) is not present in table "t".');
        for (const key of ['request', 'response', 'headers', 'config', 'options', 'params']) expect(out).not.toHaveProperty(key);
        expect(JSON.stringify(out)).not.toMatch(/k-123|k-456|k-789|k-000|alice@example\.com/);
    });

    it("names the provider, leaving out secrets in what the error carries", () => {
        const err = Object.assign(new Error('rejected'), { provider: { name: 'Sitecore Search', apiKey: 'sk-live-123' } });
        const out = serializeError(err);
        expect(out.provider).toEqual({ name: 'Sitecore Search', apiKey: '[Redacted]' });
    });

    it('leaves out the request and its credentials', () => {
        const out = serializeError(azureRestError());
        expect(out).toMatchObject({ name: 'RestError', code: 'InvalidRequestParameter', statusCode: 400 });
        expect(JSON.stringify(out)).not.toContain('super-secret');
    });
});
