// src/features/search-experience/experience-search.ts

/**
 * Search Experience search flow
 *
 * The one implementation of "search through an experience": pick its sources
 * (managed indexes and external indexes), interpret the query, build facets, run
 * every source and merge the results. The public search API and the admin
 * playground route both call executeExperienceSearch(); they differ only in how
 * they authenticate and shape the response.
 */

import 'server-only';

import type { DataSourceField, DataSourceSchema } from '@/db/schema/data-sources.schema';
import * as dataSourceService from '@/features/data-source/data-source.service';
import * as searchService from '@/features/search/search.service';
import type { FacetResult, FacetType, SearchHit, SearchRequest, SearchResponse, SortClause } from '@/features/search/search.types';
import { SEARCH_DEFAULTS, SearchError } from '@/features/search/search.types';
import * as searchIndexService from '@/features/search-index/search-index.service';
import { createLogger } from '@/shared/logger/logger';
import { ATTR, shouldLogContent, withSpan } from '@/features/telemetry';
import { externalFacetableFields, searchExternalSourceForExperience } from './external-source-search';
import { applyQueryInterpretation, type QueryInterpretation } from './query-interpreter';
import type {
  PublicSearchRequest,
  SearchExperienceExternalSourceWithDetails,
  SearchExperienceIndex,
  SearchExperienceWithIndexes,
} from './search-experience.types';

const logger = createLogger('experience-search');

// ============================================================================
// TYPES
// ============================================================================

export interface ExperienceSearchOptions {
  /** Analytics source: 'api' for real traffic, 'admin_test' for the admin playground */
  source: 'api' | 'playground' | 'admin_test';
  /** Highlight matches even when the experience doesn't enable highlighting */
  includeHighlights?: boolean;
}

/** Which source a merged hit came from. */
export interface HitOrigin {
  id: string;
  name: string;
  kind: 'index' | 'external';
}

export interface ExperienceSearchResult {
  /** Merged results, facets labelled from field definitions */
  results: SearchResponse;
  /** Sources that were searched */
  sourcesSearched: Array<{ id: string; name: string; displayName: string }>;
  /** Source of each hit, keyed by hit id */
  hitOrigins: Map<string, HitOrigin>;
  /** Sources that failed while others answered: the results are partial */
  failedSources: HitOrigin[];
  /** What query understanding did, when it ran */
  interpretation?: QueryInterpretation;
}

/** The experience has no active source matching the request. */
export class NoSourcesError extends Error {
  constructor() {
    super('No valid indexes configured for this search experience');
    this.name = 'NoSourcesError';
  }
}

// ============================================================================
// ENTRY POINT
// ============================================================================

/**
 * Search through an experience.
 *
 * @throws NoSourcesError when no active source matches the request
 * @throws SearchError when every source fails
 */
export async function executeExperienceSearch(
  experience: SearchExperienceWithIndexes,
  publicRequest: PublicSearchRequest,
  options: ExperienceSearchOptions
): Promise<ExperienceSearchResult> {
  // One trace per experience search: the engine searches nest under it, so the
  // Traces page shows a search the way it shows a chat turn.
  return withSpan(
    {
      name: 'search_experience.search',
      experienceId: experience.id,
      attributes: {
        [ATTR.EXPERIENCE_ID]: experience.id,
        [ATTR.EXPERIENCE_TYPE]: 'search',
        [ATTR.EXPERIENCE_SLUG]: experience.slug,
        [ATTR.ANALYTICS_SOURCE]: options.source,
        // What the visitor typed is content: recorded only at 'full'.
        ...(shouldLogContent(experience.id) && { [ATTR.SEARCH_QUERY]: publicRequest.query }),
      },
    },
    async (span) => {
      const indexes = resolveIndexesToSearch(experience, publicRequest.indexId);
      const external = resolveExternalSourcesToSearch(experience, publicRequest.indexId);
      if (indexes.length === 0 && external.length === 0) {
        throw new NoSourcesError();
      }

      const externalFields = await loadExternalFields(external);
      const { request, interpretation } = await buildSearchRequest(
        publicRequest,
        experience,
        indexes,
        externalFields,
        options
      );

      // Query understanding infers filters from the managed index's fields; an external
      // engine gets what the visitor sent instead.
      const externalRequest: SearchRequest = interpretation?.interpreted
        ? { ...request, query: publicRequest.query, filters: publicRequest.filters as SearchRequest['filters'] }
        : request;

      const hitOrigins = new Map<string, HitOrigin>();
      const failedSources: HitOrigin[] = [];
      const results = await executeMultiIndexSearch(
        indexes,
        external,
        externalFields,
        { managed: request, external: externalRequest },
        experience,
        options,
        hitOrigins,
        failedSources
      );

      // Label facets ("Content Type" rather than "contentType") from the field config,
      // once here rather than making every client humanize field names.
      span.setAttribute(ATTR.SEARCH_SOURCE_COUNT, indexes.length + external.length);
      span.setAttribute(ATTR.SEARCH_TOTAL_RESULTS, results.total.value);
      span.setAttribute(ATTR.SEARCH_RETURNED, results.hits.length);
      if (failedSources.length > 0) span.setAttribute(ATTR.SEARCH_FAILED_SOURCES, failedSources.length);

      const facetLabels = await collectFacetLabels(indexes, externalFields);
      results.facets = results.facets?.map((f) => ({ ...f, label: facetLabels.get(f.field) ?? undefined }));

      return {
        results,
        sourcesSearched: [
          ...indexes.map((idx) => ({
            id: idx.searchIndex.id,
            name: idx.searchIndex.name,
            displayName: idx.searchIndex.displayName,
          })),
          ...external.map((src) => ({
            id: src.dataSource.id,
            name: src.dataSource.name,
            displayName: src.dataSource.name,
          })),
        ],
        hitOrigins,
        failedSources,
        interpretation,
      };
    }
  );
}

// ============================================================================
// HELPERS
// ============================================================================

function resolveIndexesToSearch(
  experience: SearchExperienceWithIndexes,
  requestedIndexId?: string
): Array<SearchExperienceIndex & { searchIndex: { id: string; name: string; displayName: string } }> {
  // Filter to only active indexes (using searchIndex.isActive from the joined data)
  const activeIndexes = experience.indexes.filter((idx) => idx.searchIndex.isActive);

  // If specific index requested, validate and use it
  if (requestedIndexId) {
    const requestedIndex = activeIndexes.find(
      (idx) => idx.searchIndexId === requestedIndexId || idx.searchIndex.name === requestedIndexId
    );

    if (requestedIndex) {
      return [requestedIndex];
    }

    // Index not found in this experience
    logger.warn('Requested index not found in experience', {
      experienceId: experience.id,
      requestedIndexId,
      availableIndexes: activeIndexes.map((idx) => idx.searchIndexId),
    });

    return [];
  }

  // Default behavior based on configuration
  // For now, search all enabled indexes
  // In the future, this could be smarter based on AI routing
  return activeIndexes;
}

/**
 * Resolve which external indexes to search. A requested index id/name narrows the
 * search to that one source, which may be managed or external.
 */
function resolveExternalSourcesToSearch(
  experience: SearchExperienceWithIndexes,
  requestedIndexId?: string
): SearchExperienceExternalSourceWithDetails[] {
  const active = (experience.externalSources ?? []).filter((src) => src.dataSource.isActive);
  if (!requestedIndexId) return active;
  return active.filter(
    (src) => src.dataSourceId === requestedIndexId || src.dataSource.name === requestedIndexId
  );
}

/**
 * Field definitions of each external index, keyed by data source id. They drive
 * default facets, facet labels and which facets each source is asked for.
 */
async function loadExternalFields(
  sources: SearchExperienceExternalSourceWithDetails[]
): Promise<Map<string, DataSourceField[]>> {
  const fields = new Map<string, DataSourceField[]>();
  await Promise.all(
    sources.map(async (src) => {
      const ds = await dataSourceService.getDataSourceById(src.dataSourceId);
      fields.set(src.dataSourceId, (ds?.schema as DataSourceSchema | null)?.fields ?? []);
    })
  );
  return fields;
}

/**
 * Build internal search request from public request
 */
async function buildSearchRequest(
  publicRequest: PublicSearchRequest,
  experience: SearchExperienceWithIndexes,
  indexes: Array<SearchExperienceIndex & { searchIndex: { id: string; name: string; displayName: string } }>,
  externalFields: Map<string, DataSourceField[]>,
  options: ExperienceSearchOptions
): Promise<{ request: SearchRequest; interpretation?: QueryInterpretation }> {
  const searchConfig = experience.searchConfig;

  // Natural-language understanding: turn "men's t-shirts below $110" into a clean
  // query plus real filters before searching. No-op unless the experience opts in.
  const interpreted = await applyQueryInterpretation({
    query: publicRequest.query,
    clientFilters: publicRequest.filters as Array<{ field: string; operator: string; value: unknown }> | undefined,
    searchIndexId: indexes[0]?.searchIndex?.id,
    aiConfig: experience.aiConfig,
    experienceId: experience.id,
  });

  const filters = interpreted.filters as SearchRequest['filters'];

  // Handle facets: either use explicit facets from request or auto-generate from facetable fields
  let facets: SearchRequest['facets'] | undefined;

  if (publicRequest.facets && publicRequest.facets.length > 0) {
    // Use explicit facets from request
    facets = publicRequest.facets.map((f) => ({
      field: f.field,
      type: (f.type ?? 'terms') as 'terms' | 'range' | 'date_range' | 'date_histogram' | 'histogram',
      size: f.size,
    }));
  } else if (searchConfig.enableFacets) {
    // Auto-generate facets from facetable fields in attached indexes
    facets = await getDefaultFacets(indexes, externalFields);
  }

  // An explicit search type wins; 'auto' or none falls back to the experience default.
  const searchType = publicRequest.searchType && publicRequest.searchType !== 'auto'
    ? publicRequest.searchType
    : (searchConfig.defaultSearchType ?? 'auto');

  const request: SearchRequest = {
    query: interpreted.query,
    searchType,
    filters,
    facets,
    page: publicRequest.page ?? 1,
    pageSize: Math.min(
      publicRequest.pageSize ?? searchConfig.defaultPageSize ?? 20,
      searchConfig.maxPageSize ?? 100
    ),
    sort: publicRequest.sort,
    includeFields: publicRequest.includeFields,
    excludeFields: publicRequest.excludeFields,
    highlight: searchConfig.enableHighlighting || options.includeHighlights
      ? {
          preTag: '<em>',
          postTag: '</em>',
        }
      : undefined,
  };

  return { request, interpretation: interpreted.interpretation };
}

/**
 * Collect human labels for facetable fields across all indexes in the
 * experience. Keyed by raw field name → human displayName. Falls back to
 * empty map on errors so the search response still ships without labels.
 */
async function collectFacetLabels(
  indexes: Array<SearchExperienceIndex & { searchIndex: { id: string } }>,
  externalFields: Map<string, DataSourceField[]>,
): Promise<Map<string, string>> {
  const labels = new Map<string, string>();
  for (const fields of externalFields.values()) {
    for (const field of fields) {
      if (field.displayName && !labels.has(field.name)) labels.set(field.name, field.displayName);
    }
  }
  try {
    for (const indexConfig of indexes) {
      const searchIndex = await searchIndexService.getSearchIndexById(indexConfig.searchIndexId);
      if (!searchIndex?.fields) continue;
      for (const field of searchIndex.fields) {
        if (field.displayName && !labels.has(field.fieldName)) {
          labels.set(field.fieldName, field.displayName);
        }
      }
    }
  } catch (err) {
    logger.warn('Failed to collect facet labels; continuing without them', { err });
  }
  return labels;
}

/**
 * Get default facets from facetable fields in search indexes
 */
async function getDefaultFacets(
  indexes: Array<SearchExperienceIndex & { searchIndex: { id: string; name: string; displayName: string } }>,
  externalFields: Map<string, DataSourceField[]>
): Promise<SearchRequest['facets']> {
  // Collect facetable fields from all indexes
  const facetableFieldsSet = new Set<string>();

  for (const fields of externalFields.values()) {
    for (const field of externalFacetableFields(fields)) {
      facetableFieldsSet.add(field.name);
    }
  }

  for (const indexConfig of indexes) {
    const searchIndex = await searchIndexService.getSearchIndexById(indexConfig.searchIndexId);
    if (searchIndex?.fields) {
      for (const field of searchIndex.fields) {
        if (field.isFacetable && field.isIndexed) {
          facetableFieldsSet.add(field.fieldName);
        }
      }
    }
  }

  // Convert to facet requests (default to terms aggregation with size 10)
  const facets: SearchRequest['facets'] = Array.from(facetableFieldsSet).map(fieldName => ({
    field: fieldName,
    type: 'terms' as const,
    size: 10,
  }));

  logger.debug('Auto-generated default facets', {
    facetCount: facets.length,
    fields: facets.map(f => f.field),
  });

  return facets.length > 0 ? facets : undefined;
}

/**
 * Search every source of the experience and merge the results.
 */
async function executeMultiIndexSearch(
  indexes: Array<SearchExperienceIndex & { searchIndex: { id: string; name: string; displayName: string } }>,
  externalSources: SearchExperienceExternalSourceWithDetails[],
  externalFields: Map<string, DataSourceField[]>,
  requests: { managed: SearchRequest; external: SearchRequest },
  experience: SearchExperienceWithIndexes,
  options: ExperienceSearchOptions,
  hitOrigins: Map<string, HitOrigin>,
  failedSources: HitOrigin[]
): Promise<SearchResponse> {
  const hybridConfig = experience.searchConfig?.hybridConfig;
  const searchOptions = {
    source: options.source,
    experienceId: experience.id,
    experienceSlug: experience.slug,
    ...(hybridConfig && {
      hybridConfig: {
        lexicalWeight: hybridConfig.lexicalWeight,
        semanticWeight: hybridConfig.semanticWeight,
        rrfRankConstant: hybridConfig.rrfRankConstant,
        rrfWindowSize: hybridConfig.rrfWindowSize,
      },
    }),
  };

  // Each search records where its hits came from, so callers can attribute results
  // after merging without the public response shape changing.
  const tag = (origin: HitOrigin) => (result: SearchResponse) => {
    for (const hit of result.hits) {
      if (!hitOrigins.has(hit.id)) hitOrigins.set(hit.id, origin);
    }
    return result;
  };

  const sources: SourceSearch[] = [
    ...indexes.map((idx) => {
      const origin = { id: idx.searchIndexId, name: idx.searchIndex.name, kind: 'index' as const };
      return {
        origin,
        weight: idx.weight ?? 1,
        run: (req: SearchRequest) => searchService.searchById(idx.searchIndexId, req, searchOptions).then(tag(origin)),
        request: requests.managed,
      };
    }),
    ...externalSources.map((src) => {
      const origin = { id: src.dataSourceId, name: src.dataSource.name, kind: 'external' as const };
      return {
        origin,
        weight: src.weight ?? 1,
        run: (req: SearchRequest) =>
          searchExternalSourceForExperience(
            src,
            externalFields.get(src.dataSourceId) ?? [],
            req,
            experience,
            options.source
          ).then(tag(origin)),
        request: requests.external,
      };
    }),
  ];

  // Single source search
  if (sources.length === 1) {
    return sources[0].run(sources[0].request);
  }

  // Several sources: each returns its top page × pageSize, the merge ranks them together
  // and keeps the requested page. Past the per-request cap, each source pages on its own
  // and the merge is approximate.
  const page = requests.managed.page ?? 1;
  const pageSize = requests.managed.pageSize ?? 20;
  const window = page * pageSize;
  const exact = window <= SEARCH_DEFAULTS.maxPageSize;
  const sourceRequest = (req: SearchRequest): SearchRequest => (exact ? { ...req, page: 1, pageSize: window } : req);

  const outcomes = await Promise.all(
    sources.map((source) =>
      source
        .run(sourceRequest(source.request))
        .then((result) => ({ source, result, error: null as unknown }))
        .catch((error: unknown) => ({ source, result: null, error }))
    )
  );

  return mergeSearchResults(outcomes, requests.managed, experience, { exact, failedSources });
}

/** One source of an experience search, and how much its ranking counts. */
interface SourceSearch {
  origin: HitOrigin;
  weight: number;
  request: SearchRequest;
  run: (req: SearchRequest) => Promise<SearchResponse>;
}

/**
 * Merge search results from multiple sources
 */
function mergeSearchResults(
  results: Array<{ source: SourceSearch; result: SearchResponse | null; error: unknown }>,
  request: SearchRequest,
  experience: SearchExperienceWithIndexes,
  merge: { exact: boolean; failedSources: HitOrigin[] }
): SearchResponse {
  // Filter successful results
  const successfulResults = results.filter((r) => r.result !== null) as Array<{
    source: SourceSearch;
    result: SearchResponse;
  }>;

  if (successfulResults.length === 0) {
    // All searches failed
    const firstError = results.find((r) => r.error);
    if (firstError?.error instanceof Error) {
      throw firstError.error;
    }
    throw new SearchError('All index searches failed', 'PROVIDER_ERROR');
  }

  // Report partial failures: the response says results are partial, logs say which source
  const failedResults = results.filter((r) => r.error);
  if (failedResults.length > 0) {
    merge.failedSources.push(...failedResults.map((r) => r.source.origin));
    logger.warn('Some index searches failed', {
      experienceId: experience.id,
      failedIndexes: failedResults.map((r) => r.source.origin.id),
    });
  }

  const pageSize = request.pageSize ?? 20;
  const page = request.page ?? 1;

  const ranked = rankHits(
    successfulResults.map((r) => ({ key: r.source.origin.id, weight: r.source.weight, hits: r.result.hits })),
    request.sort
  );
  const mergedHits = merge.exact
    ? ranked.slice((page - 1) * pageSize, page * pageSize)
    : ranked.slice(0, pageSize);

  // Merge facets
  const mergedFacets = mergeFacets(successfulResults.map((r) => r.result.facets ?? []));

  // Calculate totals
  const totalValue = successfulResults.reduce((sum, r) => sum + r.result.total.value, 0);
  const maxTook = Math.max(...successfulResults.map((r) => r.result.took));
  const maxScore = Math.max(...successfulResults.map((r) => r.result.maxScore ?? 0));

  const totalPages = Math.ceil(totalValue / pageSize);

  return {
    hits: mergedHits,
    total: {
      value: totalValue,
      relation: 'gte', // Approximation when merging
    },
    facets: mergedFacets.length > 0 ? mergedFacets : undefined,
    took: maxTook,
    maxScore: maxScore > 0 ? maxScore : undefined,
    pagination: {
      page,
      pageSize,
      totalPages,
      totalItems: totalValue,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}

/**
 * Rank hits from several sources into one list.
 *
 * Relevance uses weighted Reciprocal Rank Fusion: a hit at rank r in a source of
 * weight w scores w / (k + r). Scores from different engines aren't comparable, ranks
 * are. An explicit sort orders by field value instead, relevance breaking ties.
 * Hits are told apart per source: the same id in two engines is two documents.
 */
export function rankHits(
  sets: Array<{ key: string; weight: number; hits: SearchHit[] }>,
  sort?: SortClause[],
  k: number = 60 // RRF constant
): SearchHit[] {
  const ranked = sets.flatMap(({ key, weight, hits }) =>
    hits.map((hit, rank) => ({ key: `${key}\u0000${hit.id}`, hit, rrf: weight / (k + rank + 1) }))
  );

  const byField = (sort ?? []).filter((c) => c.field !== '_score');
  ranked.sort((a, b) => {
    for (const clause of byField) {
      const av = fieldValue(a.hit.source, clause.field);
      const bv = fieldValue(b.hit.source, clause.field);
      // Missing values sort last in either direction
      if (isMissing(av) !== isMissing(bv)) return isMissing(av) ? 1 : -1;
      if (isMissing(av)) continue;
      const order = compareValues(av, bv);
      if (order !== 0) return clause.direction === 'desc' ? -order : order;
    }
    return b.rrf - a.rrf;
  });

  // A source can't return the same hit twice, but keep the first if one ever does
  const seen = new Set<string>();
  return ranked
    .filter(({ key }) => (seen.has(key) ? false : (seen.add(key), true)))
    .map(({ hit, rrf }) => ({ ...hit, score: rrf }));
}

function fieldValue(source: Record<string, unknown>, path: string): unknown {
  let value: unknown = source;
  for (const part of path.split('.')) {
    if (value === null || typeof value !== 'object') return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return Array.isArray(value) ? value[0] : value;
}

function isMissing(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

/** Order two present field values: numbers numerically, anything else as text. */
function compareValues(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

/**
 * Merge facets from multiple result sets
 */
function mergeFacets(
  facetSets: Array<FacetResult[]>
): FacetResult[] {
  const facetMap = new Map<
    string,
    {
      field: string;
      type: FacetType;
      buckets: Map<string | number, number>;
    }
  >();

  for (const facets of facetSets) {
    for (const facet of facets) {
      let existing = facetMap.get(facet.field);
      if (!existing) {
        existing = {
          field: facet.field,
          type: facet.type,
          buckets: new Map(),
        };
        facetMap.set(facet.field, existing);
      }

      for (const bucket of facet.buckets) {
        const currentCount = existing.buckets.get(bucket.key) ?? 0;
        existing.buckets.set(bucket.key, currentCount + bucket.count);
      }
    }
  }

  return Array.from(facetMap.values()).map((facet) => ({
    field: facet.field,
    type: facet.type,
    buckets: Array.from(facet.buckets.entries())
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count),
  }));
}
