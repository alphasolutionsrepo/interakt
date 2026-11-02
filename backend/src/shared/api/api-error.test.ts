import { describe, expect, it, vi } from 'vitest';

import { ApiError, apiErrorFrom, handleApiResponse, toApiError } from './api-error';
import { applyServerErrors } from './apply-server-errors';

describe('toApiError', () => {
    it('reads the error shape the API returns', async () => {
        const response = new Response(JSON.stringify({
            success: false,
            code: 'UPSTREAM_AUTH',
            message: 'Azure AI Search rejected the credentials.',
            error: 'Azure AI Search rejected the credentials.',
            hint: 'Check the admin key.',
            details: { provider: 'Azure AI Search', status: 403 },
            requestId: 'abc',
        }), { status: 502 });
        const error = await toApiError(response);
        expect(error).toBeInstanceOf(ApiError);
        expect(error).toMatchObject({ status: 502, code: 'UPSTREAM_AUTH', hint: 'Check the admin key.', requestId: 'abc' });
        expect(error.message).toBe('Azure AI Search rejected the credentials.');
    });

    it('falls back to the old error field and to a message with the status', async () => {
        expect(apiErrorFrom({ error: 'Old style' }, 400).message).toBe('Old style');
        expect((await toApiError(new Response('<html>Bad gateway</html>', { status: 502 }), 'Search failed')).message).toBe('Search failed (502)');
    });
});

describe('applyServerErrors', () => {
    const fieldError = new ApiError('Some values are not valid', 400, {
        code: 'VALIDATION_ERROR',
        fields: [
            { field: 'email', message: 'Already in use' },
            { field: 'settings.dimensions', message: 'Must be 1536' },
            { field: 'internalId', message: 'Not shown on the form' },
        ],
    });

    it('sets errors on fields the form has and returns them', () => {
        const setError = vi.fn();
        const form = { setError, getValues: () => ({ email: 'a@b.c', settings: { dimensions: 3072 } }) };
        const applied = applyServerErrors(form as never, fieldError);
        expect(applied).toEqual(['email', 'settings.dimensions']);
        expect(setError).toHaveBeenCalledWith('email', { type: 'server', message: 'Already in use' }, { shouldFocus: true });
        expect(setError).toHaveBeenCalledTimes(2);
    });

    it('accepts fields whose value is empty when named', () => {
        const setError = vi.fn();
        const form = { setError, getValues: () => ({}) };
        expect(applyServerErrors(form as never, fieldError, ['email'])).toEqual(['email']);
    });

    it('ignores errors without fields', () => {
        const setError = vi.fn();
        expect(applyServerErrors({ setError, getValues: () => ({}) } as never, new Error('x'))).toEqual([]);
        expect(setError).not.toHaveBeenCalled();
    });
});

describe('handleApiResponse', () => {
    const respond = (body: string, status: number, contentType = 'application/json') =>
        new Response(body, { status, headers: { 'content-type': contentType } });

    it('explains a gateway error page that is not JSON, instead of a JSON parse error', async () => {
        const err = await handleApiResponse(respond('<html><body>502 Bad Gateway</body></html>', 502, 'text/html')).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(ApiError);
        expect((err as ApiError).message).toBe('The request failed (502)');
    });

    it('unwraps data, even when it is null', async () => {
        expect(await handleApiResponse(respond(JSON.stringify({ success: true, data: { id: 1 } }), 200))).toEqual({ id: 1 });
        expect(await handleApiResponse(respond(JSON.stringify({ success: true, data: null }), 200))).toBeNull();
        expect(await handleApiResponse(respond(JSON.stringify([1, 2]), 200))).toEqual([1, 2]);
    });

    it('returns a success that is not JSON as text, and an empty one as undefined', async () => {
        expect(await handleApiResponse(respond('name,price', 200, 'text/csv'))).toBe('name,price');
        expect(await handleApiResponse(new Response(null, { status: 204 }))).toBeUndefined();
    });
});

describe('the feature API clients', () => {
    // They used their own copies, which read the body as JSON first
    it.each([
        ['tools', async () => (await import('@/app/tools/_lib/api-client')).toolsApi.getById('t1')],
        ['users', async () => (await import('@/app/users/_lib/api-client')).usersApi.getById('u1')],
        ['AI providers', async () => (await import('@/app/ai-providers/_lib/api-client')).aiProvidersApi.getById('p1')],
        ['secrets', async () => (await import('@/app/secrets/_lib/api-client')).secretsApi.list()],
    ])('%s explain a gateway error page', async (_name, call) => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>502 Bad Gateway</html>', { status: 502, headers: { 'content-type': 'text/html' } })));
        const err = await call().catch((e: unknown) => e);
        vi.unstubAllGlobals();
        expect(err).toBeInstanceOf(ApiError);
        expect((err as ApiError).status).toBe(502);
    });
});
