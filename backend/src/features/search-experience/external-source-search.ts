// src/features/search-experience/external-source-search.ts

/**
 * Search an external index for a search experience
 *
 * Runs the request through the external-search connector and returns the same
 * SearchResponse a managed index produces, so the public search handler can merge,
 * facet and paginate both kinds of source the same way.
 */

import 'server-only';

import type { DataSourceField } from '@/db/schema/data-sources.schema';
import { trackSearch } from '@/features/analytics';
import { searchExternalSource } from '@/features/data-source/external-search/external-search.service';
import type { FilterClause, SearchRequest, SearchResponse } from '@/features/search/search.types';
import { SearchError } from '@/features/search/search.types';
import { createLogger } from '@/shared/logger/logger';
import type { SearchExperienceExternalSourceWithDetails, SearchExperienceWithIndexes } from './search-experience.types';

const logger = createLogger('external-source-search');

function filterFields(filters: FilterClause[] | undefined): string[] {
  const out: string[] = [];
  for (const f of filters ?? []) {
    if (f.filters?.length) out.push(...filterFields(f.filters));
    else if (f.field) out.push(f.field);
  }
  return out;
}

/**
 * Facetable fields of an external index, from its data source schema.
 */
export function externalFacetableFields(fields: DataSourceField[]): DataSourceField[] {
  return fields.filter((f) => f.isFacetable);
}

/**
 * Search one external index and shape the result like a managed index search.
 *
 * Facets are requested only for fields the source marks facetable, so a facet that
 * belongs to another source in the same experience never reaches this engine.
 *
 * @throws SearchError('PROVIDER_ERROR') when the engine call fails
 */
export async function searchExternalSourceForExperience(
  source: SearchExperienceExternalSourceWithDetails,
  fields: DataSourceField[],
  request: SearchRequest,
  experience: SearchExperienceWithIndexes,
  analyticsSource: 'api' | 'playground' | 'admin_test' = 'api',
): Promise<SearchResponse> {
  const page = request.page ?? 1;
  const pageSize = request.pageSize ?? 20;
  const facetable = new Set(externalFacetableFields(fields).map((f) => f.name));
  const facets = request.facets
    ?.filter((f) => facetable.has(f.field))
    .map((f) => ({ field: f.field, size: f.size }));
  const startTime = Date.now();

  const track = (outcome: { total: number; returned: number; took?: number; topScore?: number; error?: string }) =>
    trackSearch({
      requestId: crypto.randomUUID(),
      source: analyticsSource,
      triggerType: 'user',
      searchType: 'lexical',
      // Analytics keys sources by id; an external index is identified by its data source.
      indexIds: [source.dataSourceId],
      experienceId: experience.id,
      experienceSlug: experience.slug,
      queryText: request.query,
      hasFilters: !!request.filters?.length,
      filterFields: filterFields(request.filters),
      filterCount: filterFields(request.filters).length,
      facetsRequested: facets?.map((f) => f.field),
      totalResults: outcome.total,
      resultsReturned: outcome.returned,
      pageNumber: page,
      topResultScore: outcome.topScore,
      durationMs: Date.now() - startTime,
      esTookMs: outcome.took,
      success: !outcome.error,
      errorMessage: outcome.error,
    });

  try {
    const { result } = await searchExternalSource(source.dataSourceId, {
      query: request.query,
      offset: (page - 1) * pageSize,
      limit: pageSize,
      filters: request.filters,
      sort: request.sort,
      facets: facets?.length ? facets : undefined,
      selectFields: request.includeFields,
    });

    if (result.unappliedFilters.length > 0 || result.unappliedSort.length > 0) {
      logger.warn('External index could not apply part of the request', {
        dataSourceId: source.dataSourceId,
        unappliedFilters: result.unappliedFilters.map((u) => `${u.field}: ${u.reason}`),
        unappliedSort: result.unappliedSort.map((u) => `${u.field}: ${u.reason}`),
      });
    }

    const totalPages = Math.ceil(result.total / pageSize);
    track({ total: result.total, returned: result.hits.length, took: result.took, topScore: result.hits[0]?.score });

    // Only fields the data source marks retrievable leave the source (the counterpart
    // of includeInResponse on a managed index). Internal attributes — environment
    // flags, source ids — would otherwise reach the widget and the AI summary.
    const hidden = new Set(fields.filter((f) => f.isRetrievable === false).map((f) => f.name));
    const hits = hidden.size === 0 || request.includeFields?.length
      ? result.hits
      : result.hits.map((hit) => ({
          ...hit,
          source: Object.fromEntries(Object.entries(hit.source).filter(([key]) => !hidden.has(key))),
        }));

    return {
      hits,
      total: { value: result.total, relation: 'eq' },
      facets: result.facets?.map((f) => ({ field: f.field, type: 'terms' as const, buckets: f.buckets })),
      took: result.took,
      maxScore: result.hits[0]?.score,
      pagination: {
        page,
        pageSize,
        totalPages,
        totalItems: result.total,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    track({ total: 0, returned: 0, error: message });
    throw new SearchError(`External index "${source.dataSource.name}" failed: ${message}`, 'PROVIDER_ERROR');
  }
}
