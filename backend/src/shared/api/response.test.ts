import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const logs = vi.hoisted(() => [] as LogLine[]);
vi.mock('@/shared/logger/logger', async () => (await import('@/shared/test/log-recorder')).recordingLogger(logs));

import { publicRoute } from './public-route';
import { PUBLIC_FAILURE_MESSAGE, apiResponse } from './response';

import { NotFoundError } from '@/shared/errors/app-error';
import { reported, type LogLine } from '@/shared/test/log-recorder';

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
        expect(body.code).toBe('INTERNAL_ERROR');
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
        // Nor which service failed: the message is the plain public one
        expect(body.message).toBe(PUBLIC_FAILURE_MESSAGE);
        expect(JSON.stringify(body)).not.toContain('Azure');
    });

    it('still tells admins which service failed', async () => {
        const body = await apiResponse.error(azureAuthError()).json();
        expect(body.message).toBe('Azure AI Search rejected the credentials.');
    });

    it('keeps the message of a public request the caller got wrong', async () => {
        const handler = publicRoute(async () => apiResponse.badRequest('query is required'));
        expect((await (await handler()).json()).message).toBe('query is required');
    });
});

describe('apiResponse.validationError', () => {
    it('lists the fields', async () => {
        const result = z.object({ name: z.string().min(1) }).safeParse({ name: '' });
        const body = await apiResponse.validationError(!result.success ? result.error : (undefined as never)).json();
        expect(body).toMatchObject({ code: 'VALIDATION_ERROR', fields: [{ field: 'name' }] });
        // details is the public API's documented list; admins read fields only
        expect(body.details).toBeUndefined();
    });

    it('also lists them as details on public routes, as the public API documents', async () => {
        const result = z.object({ name: z.string().min(1) }).safeParse({ name: '' });
        const handler = publicRoute(async () => apiResponse.validationError(!result.success ? result.error : (undefined as never)));
        const body = await (await handler()).json();
        expect(body.details).toEqual(body.fields);
    });
});

describe('the level a failure is logged at', () => {
    const answer = (err: unknown) => { logs.length = 0; return apiResponse.error(err); };

    it("is a warning when the request was wrong", () => {
        expect(answer(new NotFoundError('Document not found')).status).toBe(404);
        expect(reported(logs)).toEqual([expect.objectContaining({ level: 'warn' })]);
    });

    it('is an error when our setup is at fault, though the answer is a 400', () => {
        const disabled = Object.assign(new Error('Provider "openai" is disabled'), { name: 'AIServiceError', code: 'PROVIDER_DISABLED' });
        const res = answer(disabled);
        expect(res.status).toBe(400);
        expect(reported(logs)).toEqual([expect.objectContaining({ level: 'error', context: expect.objectContaining({ code: 'PROVIDER_DISABLED' }) })]);
    });

    it('is an error when a service we depend on failed', () => {
        answer(Object.assign(new Error('Access denied'), { name: 'RestError', statusCode: 403 }));
        expect(reported(logs)).toEqual([expect.objectContaining({ level: 'error' })]);
    });
});


describe('apiResponse.refused', () => {
    const missing = new Error('Search index abc not found');
    const refuse = (err: unknown, details?: unknown) => {
        logs.length = 0;
        return apiResponse.refused(err, { code: 'NOT_FOUND', message: 'Search index not found', details }, { operation: 'getSearchIndex' });
    };

    const blocked = { dependents: ['title_ngram'] };
    // The code alone takes the cause's message (an error's, or a string as it is)
    const helpers = [
        { helper: 'notFound', cause: new Error('Search index not found'), refusal: 'NOT_FOUND' as const, answer: () => apiResponse.notFound('Search index not found') },
        { helper: 'badRequest', cause: 'Name already exists', refusal: 'BAD_REQUEST' as const, answer: () => apiResponse.badRequest('Name already exists') },
        { helper: 'conflict', cause: missing, refusal: { code: 'CONFLICT' as const, message: 'Field is used', details: blocked }, answer: () => apiResponse.conflict('Field is used', blocked) },
    ];
    const run = (where: string, answer: () => Response) => (where === 'on a public route' ? publicRoute(async () => answer())() : Promise.resolve(answer()));

    describe.each(['on an admin route', 'on a public route'])('%s', (where) => {
        it.each(helpers)('answers as $helper does', async ({ cause, refusal, answer }) => {
            const [refused, helper] = [await run(where, () => apiResponse.refused(cause, refusal)), await run(where, answer)];
            const [a, b] = [await refused.json(), await helper.json()];
            expect(refused.status).toBe(helper.status);
            expect({ ...a, requestId: undefined }).toEqual({ ...b, requestId: undefined });
            expect(a.requestId).toMatch(/^[0-9a-f]{32}$/);
        });
    });

    it('logs it once as a warning, with the error that caused it and the operation', async () => {
        const { requestId } = await refuse(missing).json();
        expect(reported(logs)).toEqual([
            expect.objectContaining({ level: 'warn', context: expect.objectContaining({ requestId, operation: 'getSearchIndex', code: 'NOT_FOUND', err: expect.objectContaining({ cause: missing }) }) }),
        ]);
    });

    it('logs it as an error when the cause is ours to fix, as an AI model that is gone', () => {
        const modelDown = Object.assign(new Error('model "qwen2.5:14b" not found'), { name: 'AdapterError', providerKey: 'ollama', statusCode: 404 });
        expect(refuse(modelDown).status).toBe(404);
        expect(reported(logs)).toEqual([expect.objectContaining({ level: 'error' })]);
    });
});
