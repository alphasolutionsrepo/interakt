// src/features/analytics/search-query-fields.ts

import type { SearchEventData } from './analytics.types';

/**
 * The query fields stored for a search: what the visitor typed as its query, and what was
 * searched when query understanding changed it. Reports group and count by the visitor's words;
 * the searched query shows what the engine was actually asked.
 */
export function searchQueryFields(
  event: Pick<SearchEventData, 'queryText' | 'visitorQuery'>,
): { queryText: string; searchedQuery?: string } {
  const { queryText: searched, visitorQuery } = event;
  if (visitorQuery === undefined || visitorQuery.trim() === searched.trim()) {
    return { queryText: searched };
  }
  return { queryText: visitorQuery, searchedQuery: searched };
}
