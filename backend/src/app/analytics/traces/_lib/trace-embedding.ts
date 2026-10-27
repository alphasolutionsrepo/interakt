// src/app/analytics/traces/_lib/trace-embedding.ts

/**
 * Which embeddings in a trace belong to a search: only a search query's (an index search's or a
 * file-store search's). Other embeddings in the same turn (chat messages saved for recall, the
 * topic guardrail, memory) can run while a search is open and must not be shown as its query.
 * Traces that recorded no feature are paired by time, as before.
 */
const SEARCH_QUERY_FEATURES = new Set(['search_query', 'knowledge_search']);

export function isSearchQueryEmbedding(feature: string | undefined): boolean {
  return !feature || SEARCH_QUERY_FEATURES.has(feature);
}
