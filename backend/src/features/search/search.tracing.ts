// src/features/search/search.tracing.ts

/**
 * Search Service Tracing
 *
 * Thin tracing wrapper for search operations.
 * Creates a span around the search call, recording
 * query, type, index, and result metrics.
 */

import { SpanKind, type Span } from '@opentelemetry/api';
import { withSpan , ATTR } from '@/features/telemetry';

/**
 * Wrap a search execution in a span.
 */
export function traceSearch<T>(
  options: {
    experienceId?: string;
    query: string;
    searchType: string;
    indexName?: string;
    triggerType?: string;
  },
  fn: (span: Span) => Promise<T>
): Promise<T> {
  return withSpan(
    {
      name: 'search.execute',
      kind: SpanKind.INTERNAL,
      experienceId: options.experienceId,
      attributes: {
        [ATTR.SEARCH_QUERY]: options.query,
        [ATTR.SEARCH_TYPE]: options.searchType,
        ...(options.indexName && { [ATTR.SEARCH_INDEX_NAME]: options.indexName }),
        ...(options.triggerType && { [ATTR.SEARCH_TRIGGER]: options.triggerType }),
      },
    },
    fn
  );
}
