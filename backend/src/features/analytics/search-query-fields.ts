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
  // No words of the visitor's own (a browse, or a caller that has none): recorded as searched
  if (!visitorQuery?.trim() || visitorQuery.trim() === searched.trim()) {
    return { queryText: searched };
  }
  return { queryText: visitorQuery, searchedQuery: searched };
}

/** Shown when every word of the visitor's question became a filter and no text was searched. */
export const FILTERS_ONLY_LABEL = 'searched with filters only';

/**
 * What a stored search was searched as, for display: the query searched, or "filters only"
 * when every word became a filter (stored as an empty searched query). Undefined when query
 * understanding did not change the visitor's words.
 */
export function searchedAs(searchedQuery: string | null | undefined): { query: string } | { filtersOnly: true } | undefined {
  if (searchedQuery == null) return undefined;
  return searchedQuery.trim() === '' ? { filtersOnly: true } : { query: searchedQuery };
}
