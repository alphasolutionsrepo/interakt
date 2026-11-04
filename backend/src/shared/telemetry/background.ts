// src/shared/telemetry/background.ts

/**
 * Background work (a timer that flushes or sweeps) is no part of the request that
 * happened to start it. A timer keeps the trace that was active when it was created, so
 * without this every tick would be traced and logged as part of that request, long
 * after it ended.
 */

import { ROOT_CONTEXT, context } from '@opentelemetry/api';

/** Run start (which creates the timer) outside any trace, and return what it returns */
export function inBackground<T>(start: () => T): T {
    return context.with(ROOT_CONTEXT, start);
}
