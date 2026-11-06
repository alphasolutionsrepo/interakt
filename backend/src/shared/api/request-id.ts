// src/shared/api/request-id.ts

/**
 * The id that ties what the user sees to the server log: the trace id of the current
 * request when tracing is on (so it also finds the trace), otherwise a random id.
 */

import { trace } from '@opentelemetry/api';

export function currentRequestId(): string {
    return activeTraceId() ?? crypto.randomUUID().replaceAll('-', '');
}

function activeTraceId(): string | undefined {
    const traceId = trace.getActiveSpan()?.spanContext().traceId;
    return traceId && !/^0+$/.test(traceId) ? traceId : undefined;
}

// The id each failure was given, so every place that reports it (the job record on
// the index, the error response, the log line) shows the same one, with or without tracing
const failureIds = new WeakMap<object, string>();
const MAX_CAUSES = 5;

/**
 * The request id for a failure. With tracing on it is the current trace id, the same
 * everywhere in the request. Without, it is the id the failure was already given,
 * looking through the errors it wraps (a job records the inner error, the response
 * gets the wrapper), or a new one that sticks to it. Requests that share one failure
 * (a cached lookup that rejected) then share its id.
 */
export function requestIdFor(err: unknown): string {
    const traceId = activeTraceId();
    if (traceId) return traceId;
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
