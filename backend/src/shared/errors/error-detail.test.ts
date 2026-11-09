import { describe, expect, it } from 'vitest';

import { redactSecrets, scrubCredentials, serializeError, toErrorDetail } from './error-detail';

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

    it('expands an error inside the value, with its fields and cause', () => {
        const failed = Object.assign(new Error('Search failed', { cause: new Error('connect ECONNREFUSED') }), { statusCode: 503 });
        expect(redactSecrets({ attempt: { error: failed } })).toMatchObject({ attempt: { error: { message: 'Search failed', statusCode: 503, cause: { message: 'connect ECONNREFUSED' } } } });
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

describe('scrubCredentials', () => {
    it.each([
        ['a password in a URL', 'connect to https://elastic:hunter2@es.example.com:9200 failed', 'connect to https://[Redacted]@es.example.com:9200 failed'],
        ['a database URL', 'postgres://app:pa55@db:5432/interakt', 'postgres://[Redacted]@db:5432/interakt'],
        ['a URL password with ? and # in it', 'connect to https://elastic:pa?s#s@es:9200 failed', 'connect to https://[Redacted]@es:9200 failed'],
        ['a key in a query', 'GET /indexes?api-version=2024&api-key=k3y', 'GET /indexes?api-version=2024&api-key=[Redacted]'],
        ['a signature and a token in a query', 'https://x.blob.core.windows.net/c?sv=1&sig=abc%2B&token=t0k', 'https://x.blob.core.windows.net/c?sv=1&sig=[Redacted]&token=[Redacted]'],
        ['a bearer token', 'Authorization: Bearer eyJhbGciOi.x.y', 'Authorization: Bearer [Redacted]'],
        ['an Elasticsearch API key', 'header ApiKey c2VjcmV0 refused', 'header ApiKey [Redacted] refused'],
        ['basic credentials', 'Basic ZWxhc3RpYzpodW50ZXIy', 'Basic [Redacted]'],
        ['a lower-case bearer token', 'authorization: bearer abc123def', 'authorization: bearer [Redacted]'],
        ['a storage connection string', 'DefaultEndpointsProtocol=https;AccountName=a;AccountKey=abc123==;EndpointSuffix=core', 'DefaultEndpointsProtocol=https;AccountName=a;AccountKey=[Redacted];EndpointSuffix=core'],
        ['a service bus connection string', 'Endpoint=sb://x/;SharedAccessKeyName=root;SharedAccessKey=s3cr3t', 'Endpoint=sb://x/;SharedAccessKeyName=root;SharedAccessKey=[Redacted]'],
        ['a function key in a query', 'https://fn.azurewebsites.net/api/run?code=abc123', 'https://fn.azurewebsites.net/api/run?code=[Redacted]'],
        ['an api-key header written out', 'sent api-key: k3y-value to search', 'sent api-key: [Redacted] to search'],
        ['a key at the start', 'api_key=k3y&q=linen', 'api_key=[Redacted]&q=linen'],
        ['refresh and id tokens', '/oauth?refresh_token=r3f&id_token=eyJ0', '/oauth?refresh_token=[Redacted]&id_token=[Redacted]'],
        ['an opaque bearer key', 'Bearer sk-proj-abc123', 'Bearer [Redacted]'],
        ['a camelCase token in a query', '/cb?accessToken=abc123&x=1', '/cb?accessToken=[Redacted]&x=1'],
        ['a token in a URL fragment', 'https://app/cb#access_token=ya29abc&state=1', 'https://app/cb#access_token=[Redacted]&state=1'],
        ['a password after a comma', 'user=a,password=hunter2', 'user=a,password=[Redacted]'],
        ['a token scheme', 'Authorization: Token abc123def', 'Authorization: Token [Redacted]'],
        ['a raw authorization value', 'authorization=9944b09199c62bcf9418ad846dd0e4bb', 'authorization=[Redacted]'],
        ['a URL with a password and no user', 'redis://:pa55@cache:6379', 'redis://[Redacted]@cache:6379'],
        ['a connection-string password with # in it', 'Server=db;User Id=app;Password=Xy#9pq;', 'Server=db;User Id=app;Password=[Redacted];'],
        ['a quoted password', "host=db user=app password='s3 cr3t' port=5432", "host=db user=app password=[Redacted] port=5432"],
        ['a double-quoted token', 'token="abc" other', 'token=[Redacted] other'],
        ['a password inside quotes', 'Invalid DSN "password=hunter2 host=db"', 'Invalid DSN "password=[Redacted] host=db"'],
        ['a token in brackets', '(token=abc123) [api_key=k3y] {secret=s3c}', '(token=[Redacted]) [api_key=[Redacted]] {secret=[Redacted]}'],
        ['a password with an unclosed quote', 'password="hunter2', 'password=[Redacted]'],
        ['an escaped quoted password', '{"conn":"host=db password=\\"s3cr3t\\" port=5432"}', '{"conn":"host=db password=[Redacted]\\" port=5432"}'],
        ['basic credentials of letters only', 'Authorization: Basic dXNlcjpwYXNz', 'Authorization: Basic [Redacted]'],
        ['a padded basic credential', 'Basic YWJjZGVm=', 'Basic [Redacted]'],
    ])('replaces %s', (_what, text, scrubbed) => {
        expect(scrubCredentials(text)).toBe(scrubbed);
    });

    it.each([
        ['a URL without credentials', 'https://es.example.com:9200/_search?size=10&q=linen'],
        ['counts named like tokens', 'maxTokens=4000&tokens=12'],
        ['an email address', 'sent to someone@example.com'],
        ['the word basic in a sentence', 'Basic search is on'],
        ['a request id', 'request 4bf92f3577b34da6a3ce929d0e0e4736 failed'],
        ['a status code', 'status code: 500, key: title'],
        ['a product code in a query', '/products?sku=HC-1001&size=10'],
        ['a sentence ending in a header name', 'Unauthorized: expected Bearer token.'],
        ['basic search at the end of a sentence', 'Fell back to Basic search.'],
        ['a hyphenated word after Bearer', 'Uses Bearer token-based auth'],
        ["Elasticsearch's sign-in challenge", 'Basic realm="security" charset="UTF-8"'],
        ['an email in a query after a port', 'http://localhost:3000?email=a@b.com'],
    ])('leaves %s as it is', (_what, text) => {
        expect(scrubCredentials(text)).toBe(text);
    });
});

describe('credentials in an error', () => {
    const failed = () => new Error('fetch https://search.example.com/q?api_key=k3y failed', { cause: new Error('connect https://elastic:hunter2@es:9200') });

    it('are left out of what an admin is shown', () => {
        const detail = JSON.stringify(toErrorDetail(failed()));
        expect(detail).not.toContain('k3y');
        expect(detail).not.toContain('hunter2');
    });

    it('are left out of the serialized error, its stack included', () => {
        const serialized = JSON.stringify(serializeError(failed()));
        expect(serialized).not.toContain('k3y');
        expect(serialized).not.toContain('hunter2');
    });
});

describe('an error whose message is not text', () => {
    const odd = () => Object.assign(new Error('x'), { message: { code: 'E' } as unknown as string });

    it('is explained as the text of what was put there', () => {
        expect(toErrorDetail(odd()).message).toBe('{"code":"E"}');
        expect(serializeError(odd())).toMatchObject({ name: 'Error', message: '{"code":"E"}' });
    });

    it('leaves out the credentials in it', () => {
        const withKey = Object.assign(new Error('x'), { message: { apiKey: 'k3y', url: 'https://u:hunter2@h' } as unknown as string });
        expect(JSON.stringify(serializeError(withKey))).not.toMatch(/k3y|hunter2/);
    });

    it('is written as [Unreadable] when reading it throws', () => {
        const flaky = Object.defineProperty(new Error('x'), 'message', { get() { throw new Error('no message'); } });
        expect(serializeError(flaky)).toMatchObject({ name: 'Error', message: '[Unreadable]' });
        expect(() => toErrorDetail(flaky)).not.toThrow();
    });
});
