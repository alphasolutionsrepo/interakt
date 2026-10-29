import { describe, expect, it, vi } from 'vitest';

import { ApiError, apiErrorFrom, toApiError } from './api-error';
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
