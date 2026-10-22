// src/app/analytics/traces/_lib/trace-status.ts

import type { SpanListItem } from './api-client';

/**
 * How a trace ended, for the Traces list: failed, cancelled (a summary the
 * visitor left before it finished, which is not a failure), or completed.
 */
export type TraceStatus = 'error' | 'cancelled' | 'ok';

export function traceStatus(span: Pick<SpanListItem, 'statusCode' | 'cancelled'>): TraceStatus {
  if (span.statusCode === 'ERROR') return 'error';
  if (span.cancelled) return 'cancelled';
  return 'ok';
}
