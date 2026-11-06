// src/features/search-experience/external-refusal.ts

/**
 * Whether an external engine's 400 blames the caller's filter or sort (request-refusal.ts).
 * Only for engines whose wording that was checked against; anything else stays a failure
 * of the source.
 */

import type { DataSourceField } from '@/db/schema/data-sources.schema';
import { ExternalSearchError } from '@/features/data-source/external-search/external-search.types';
import { refusalFor } from '@/features/search/request-refusal';
import type { FilterClause, SearchError, SearchRequest } from '@/features/search/search.types';

/** The engines whose 400 wording request-refusal.ts was checked against */
const KNOWN_WORDING = new Set(['Elasticsearch', 'Azure AI Search', 'Sitecore Search']);

/**
 * The 400 to answer when the engine's reason blames the request's filter or sort. fixed are
 * filters sent with it that the caller didn't write (a tool's defaults); the source's own
 * fixed filters come with the error.
 */
export function refusedRequest(error: unknown, request: SearchRequest, fields: DataSourceField[], fixed: FilterClause[] = []): SearchError | undefined {
  if (!(error instanceof ExternalSearchError) || error.status !== 400 || !KNOWN_WORDING.has(error.provider)) return undefined;
  // The engine names a field as it was sent: the schema's filterField when there is one
  return refusalFor(error.message, request, (name) => [name, fields.find((f) => f.name === name)?.filterField], error, [...error.fixedFilters, ...fixed]);
}
