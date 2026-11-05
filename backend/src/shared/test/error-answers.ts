// src/shared/test/error-answers.ts

/**
 * Checks for a failure answered through apiResponse or describeError: a database error
 * whose text is its SQL, and the answer it must get (no SQL, the INTERNAL_ERROR code
 * and a request id, logged once as an error with the operation and the error).
 */

import { expect } from 'vitest';

import { reported, type LogLine } from './log-recorder';

import { streamEvents } from '@/shared/api/stream-events';

/** A database error as the driver throws it: its text is the query */
export function failedQuery(): Error {
    return Object.assign(new Error('Failed query: select "id", "title" from "admin_chat_sessions" where "title" ilike $1\nparams: %q4%'), { code: '42703' });
}

/** The answer to an error we don't recognise: no error text, a request id, logged once as an error */
export function expectInternalFailure(body: Record<string, unknown>, logs: LogLine[], operation: string, err: unknown): void {
    expect(body).toMatchObject({ code: 'INTERNAL_ERROR', requestId: expect.any(String) });
    // Clients read error or message: both are the same text
    expect(body.error).toBe(body.message);
    expect(JSON.stringify(body)).not.toMatch(/select|admin_chat_sessions/);
    expect(reported(logs)).toEqual([
        expect.objectContaining({ level: 'error', context: expect.objectContaining({ requestId: body.requestId, operation, err }) }),
    ]);
}

/** The error event of a server-sent event stream */
export async function errorEvent(response: Response): Promise<Record<string, unknown>> {
    for await (const event of streamEvents(response)) {
        if (event.type === 'error') return event;
    }
    throw new Error('The stream sent no error event');
}
