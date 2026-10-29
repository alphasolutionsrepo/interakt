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
