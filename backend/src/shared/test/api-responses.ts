// src/shared/test/api-responses.ts

/**
 * Answers our API, or a gateway in front of it, can give, for tests of the admin's
 * API clients: fetch is stubbed to answer with one, and the client's result checked.
 */

import { expect, vi } from 'vitest';

const JSON_TYPE = { 'content-type': 'application/json' };

/** The HTML error page a proxy answers with when the app can't be reached */
export const gatewayErrorPage = () => new Response('<html><body>502 Bad Gateway</body></html>', { status: 502, headers: { 'content-type': 'text/html' } });

/** The error shape the API answers with (see APIErrorResponse in response.ts) */
export const API_ERROR = { success: false, code: 'NOT_FOUND', message: 'The index was not found.', hint: 'Pick another index.', requestId: 'req-1' };
export const apiErrorResponse = (status = 404) => new Response(JSON.stringify(API_ERROR), { status, headers: JSON_TYPE });

/** A success the way apiResponse.success sends it, with anything else beside the data */
export const apiSuccess = (data: unknown, extra: Record<string, unknown> = {}, status = 200) =>
    new Response(JSON.stringify({ success: true, data, ...extra }), { status, headers: JSON_TYPE });

/** Stub fetch to answer every call with a fresh copy of the response; returns the stub */
export function answerWith(response: () => Response) {
    const stub = vi.fn(async () => response());
    vi.stubGlobal('fetch', stub);
    return stub;
}

/** The call failed with a readable error for a gateway's page, not a JSON parse error */
export async function expectGatewayError(call: Promise<unknown>) {
    const error = await call.then(() => undefined, (e: unknown) => e);
    expect(error).toMatchObject({ name: 'ApiError', status: 502 });
    expect((error as Error).message).not.toMatch(/Unexpected token|JSON/);
}

/** The call failed with the API's own message, hint and request id */
export async function expectApiError(call: Promise<unknown>, status = 404) {
    await expect(call).rejects.toMatchObject({ name: 'ApiError', status, message: API_ERROR.message, hint: API_ERROR.hint, requestId: API_ERROR.requestId });
}
