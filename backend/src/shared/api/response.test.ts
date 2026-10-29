import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('@/shared/logger/logger', () => ({
    createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

import { publicRoute } from './public-route';
import { apiResponse } from './response';

import { NotFoundError } from '@/shared/errors/app-error';

const azureAuthError = () => Object.assign(new Error('Access denied'), { name: 'RestError', statusCode: 403 });

describe('apiResponse.error', () => {
    it('explains provider errors with a hint, details and a request id', async () => {
        const response = apiResponse.error(azureAuthError());
        const body = await response.json();
        expect(response.status).toBe(502);
        expect(body).toMatchObject({
            success: false,
            code: 'UPSTREAM_AUTH',
            message: 'Azure AI Search rejected the credentials.',
            error: 'Azure AI Search rejected the credentials.',
            details: { provider: 'Azure AI Search', status: 403 },
        });
        expect(body.hint).toBeTruthy();
        expect(body.requestId).toMatch(/^[0-9a-f]{32}$/);
    });

    it('keeps internals out of unknown errors', async () => {
        const response = apiResponse.error(new Error('column "foo" does not exist'));
        const body = await response.json();
        expect(response.status).toBe(500);
        expect(body.code).toBe('INTERNAL');
        expect(JSON.stringify(body)).not.toContain('foo');
        expect(body.details).toBeUndefined();
    });

    it('uses the status of a recognised error over the default', async () => {
        const response = apiResponse.error(new NotFoundError('Search index not found'));
        expect(response.status).toBe(404);
        expect(await response.json()).toMatchObject({ code: 'NOT_FOUND', message: 'Search index not found' });
    });

    it('shows the message of an error the caller marked as a 4xx', async () => {
        const response = apiResponse.error(new Error('Name is required'), 400);
        expect(await response.json()).toMatchObject({ code: 'BAD_REQUEST', message: 'Name is required' });
    });

    it('shows our own string messages', async () => {
        const response = apiResponse.error('Search service is unhealthy', 503);
        expect(response.status).toBe(503);
        expect(await response.json()).toMatchObject({ message: 'Search service is unhealthy' });
    });

    it('leaves out hint and details on public routes', async () => {
        const handler = publicRoute(async () => apiResponse.error(azureAuthError()));
        const body = await (await handler()).json();
        expect(body.code).toBe('UPSTREAM_AUTH');
        expect(body.hint).toBeUndefined();
        expect(body.details).toBeUndefined();
    });
});

describe('apiResponse.validationError', () => {
    it('lists the fields', async () => {
        const result = z.object({ name: z.string().min(1) }).safeParse({ name: '' });
        const body = await apiResponse.validationError(!result.success ? result.error : (undefined as never)).json();
        expect(body).toMatchObject({ code: 'VALIDATION_ERROR', fields: [{ field: 'name' }] });
    });
});
