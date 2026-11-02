// src/shared/api/request-id.ts

/**
 * The id that ties what the user sees to the server log: the trace id of the current
 * request when tracing is on (so it also finds the trace), otherwise a random id.
 */

import { trace } from '@opentelemetry/api';

export function currentRequestId(): string {
    const traceId = trace.getActiveSpan()?.spanContext().traceId;
    return traceId && !/^0+$/.test(traceId) ? traceId : crypto.randomUUID().replaceAll('-', '');
}

// The id each failure was given, so every place that reports it (the job record on
// the index, the error response, the log line) shows the same one, with or without tracing
const failureIds = new WeakMap<object, string>();
const MAX_CAUSES = 5;

/**
 * The request id for a failure: the one it was already given, looking through the
 * errors it wraps (a job records the inner error, the response gets the wrapper),
 * or a new one that sticks to it.
 */
export function requestIdFor(err: unknown): string {
    let current: unknown = err;
    for (let i = 0; current !== null && typeof current === 'object' && i <= MAX_CAUSES; i++) {
        const known = failureIds.get(current);
        if (known) return known;
        current = (current as { cause?: unknown }).cause;
    }
    const id = currentRequestId();
    if (err !== null && typeof err === 'object') failureIds.set(err, id);
    return id;
}
