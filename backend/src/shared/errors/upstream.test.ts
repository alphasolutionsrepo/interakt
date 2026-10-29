import { describe, expect, it } from 'vitest';

import { classifyUpstream, scrub } from './upstream';

/** Shaped like @azure/core-rest-pipeline's RestError */
function azureError(statusCode: number, message: string, code?: string) {
    return Object.assign(new Error(message), {
        name: 'RestError',
        statusCode,
        code,
        request: { headers: { 'api-key': 'super-secret-admin-key' } },
        response: { status: statusCode, bodyAsText: JSON.stringify({ error: { code, message } }) },
    });
}

/** Shaped like @elastic/elasticsearch's ResponseError */
function elasticError(statusCode: number, type: string, reason: string) {
    return Object.assign(new Error(type), {
        name: 'ResponseError',
        meta: { statusCode, body: { error: { type, reason } } },
    });
}

/** Shaped like the openai SDK's APIError */
function openAIError(status: number, code: string, message: string) {
    return Object.assign(new Error(`${status} ${message}`), { name: 'APIError', status, error: { code, message } });
}

describe('classifyUpstream', () => {
    it('ignores errors that no provider raised', () => {
        expect(classifyUpstream(new Error('relation "users" does not exist'))).toBeUndefined();
        expect(classifyUpstream('boom')).toBeUndefined();
    });

    it('names Azure AI Search when it rejects the key, without leaking the key', () => {
        const err = classifyUpstream(azureError(403, 'Access denied'));
        expect(err).toMatchObject({ code: 'UPSTREAM_AUTH', status: 502, message: 'Azure AI Search rejected the credentials.' });
        expect(err?.hint).toMatch(/admin key/);
        expect(err?.details).toMatchObject({ provider: 'Azure AI Search', status: 403, message: 'Access denied' });
        expect(JSON.stringify(err?.details)).not.toContain('super-secret');
    });

    it('finds the provider error through wrapping errors', () => {
        const wrapped = new Error('Failed to create index: bad', {
            cause: azureError(400, 'The vector field dimensions 1536 does not match 3072.', 'InvalidRequestParameter'),
        });
        const err = classifyUpstream(wrapped);
        expect(err).toMatchObject({ code: 'UPSTREAM_DIMENSION_MISMATCH', status: 502 });
        expect(err?.details).toMatchObject({ provider: 'Azure AI Search', status: 400, code: 'InvalidRequestParameter' });
    });

    it('reads Elasticsearch mapping errors', () => {
        const err = classifyUpstream(elasticError(400, 'illegal_argument_exception', 'mapper [title] cannot be changed from type [text] to [keyword]'));
        expect(err).toMatchObject({ code: 'UPSTREAM_SCHEMA_MISMATCH', message: 'Elasticsearch rejected the index definition.' });
        expect(err?.details).toMatchObject({ message: 'mapper [title] cannot be changed from type [text] to [keyword]' });
    });

    it('reads Elasticsearch connection errors', () => {
        const err = classifyUpstream(Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:9200'), { name: 'ConnectionError', meta: { meta: {} } }));
        expect(err).toMatchObject({ code: 'UPSTREAM_UNAVAILABLE', status: 503 });
    });

    it('reads OpenAI quota and rate limits', () => {
        expect(classifyUpstream(openAIError(429, 'insufficient_quota', 'You exceeded your current quota')))
            .toMatchObject({ code: 'UPSTREAM_QUOTA', message: 'The AI provider account is out of quota.' });
        expect(classifyUpstream(openAIError(429, 'rate_limit_exceeded', 'Rate limit reached')))
            .toMatchObject({ code: 'UPSTREAM_RATE_LIMITED', status: 503 });
    });

    it('names the AI provider from our adapter errors', () => {
        const err = classifyUpstream(Object.assign(new Error('Request timed out'), { name: 'AdapterError', providerKey: 'openai', retryable: true }));
        expect(err).toMatchObject({ code: 'UPSTREAM_TIMEOUT', status: 504, message: "OpenAI didn't respond in time." });
        expect(err?.hint).toMatch(/Try again/);
    });

    it('maps AIServiceError codes', () => {
        const cause = Object.assign(new Error('401'), { name: 'AdapterError', providerKey: 'azure-openai', statusCode: 401 });
        const err = Object.assign(new Error('Authentication failed'), { name: 'AIServiceError', code: 'AUTHENTICATION_FAILED', cause });
        expect(classifyUpstream(err)).toMatchObject({ code: 'UPSTREAM_AUTH', message: 'Azure OpenAI rejected the credentials.' });
    });

    it('falls back to a general provider error', () => {
        const err = classifyUpstream(azureError(400, 'Something odd happened'));
        expect(err).toMatchObject({ code: 'UPSTREAM_ERROR', status: 502, message: 'Azure AI Search returned an error.' });
        expect(err?.hint).toBeUndefined();
    });
});

describe('scrub', () => {
    it('removes credentials from provider messages', () => {
        const text = scrub('GET https://user:pa55@search.example.net/indexes?api-key=abc123&x=1 Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload failed');
        expect(text).not.toContain('pa55');
        expect(text).not.toContain('abc123');
        expect(text).not.toContain('eyJhbGciOiJIUzI1NiJ9');
        expect(text).toContain('x=1');
    });

    it('removes long key-like strings and cuts long messages', () => {
        expect(scrub('key AbCdEf0123456789AbCdEf0123456789XyZ was rejected')).not.toContain('AbCdEf0123456789');
        expect(scrub('x'.repeat(1000)).length).toBeLessThanOrEqual(301);
    });
});
