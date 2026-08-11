// src/features/tools/executors/data-source/search.ts

/**
 * Data Source Search Executor
 *
 * Single-purpose executor: queries a data source for ranked results.
 * Supports both managed (internal) and external search indexes.
 */

import * as searchService from '@/features/search/search.service';
import * as dataSourceService from '@/features/data-source/data-source.service';
import { trackSearch } from '@/features/analytics';
import { callAzureAISearch } from '../callers/azure-ai-search';
import { callElasticsearchSearch } from '../callers/elasticsearch';
import { executeFileStoreSearch } from './file-store';
import { translateFilters, translateSort, type UnappliedClause } from '../external-query';
import {
  mergeDefaultFilters,
  mergeDefaultSort,
  describeAppliedConfig,
  annotateResult,
} from '../filter-defaults';
import {
  resolveDataSource,
  buildFilterClauses,
  buildSortClauses,
  logger,
  type ResolvedManagedSource,
  type ResolvedExternalSource,
  type DataSourceSchema,
  type DataSourceField,
  type OperationResult,
} from './shared';

// ============================================================================
// INPUT TYPE
// ============================================================================

interface SearchInput {
  query?: string;
  filters?: Array<{ field: string; operator: string; value: unknown }>;
  sort?: string | Array<{ field: string; direction?: 'asc' | 'desc' }>;
}

// ============================================================================
// CONFIG TYPE (from tool.executorConfig)
// ============================================================================

interface SearchConfig {
  maxResults?: number;
  /** Fields to return in search results. When set, only these fields are included in the response data — reduces token usage for downstream AI synthesis. */
  responseFields?: string[];
  /** Include search highlights in results. Defaults to true. */
  includeHighlights?: boolean;
  defaultFilters?: Array<{ field: string; operator: string; value: unknown }>;
  defaultSort?: Array<{ field: string; direction: 'asc' | 'desc' }>;
  searchType?: 'lexical' | 'semantic' | 'hybrid';
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

export async function executeDataSourceSearch(
  dataSourceId: string,
  config: Record<string, unknown>,
  input: Record<string, unknown>,
): Promise<OperationResult> {
  const searchConfig = config as unknown as SearchConfig;
  const searchInput = input as unknown as SearchInput;

  try {
    if (!dataSourceId) {
      return { success: false, error: 'dataSourceId is required for search operations' };
    }

    const source = await resolveDataSource(dataSourceId);

    if (source.kind === 'file_store') return executeFileStoreSearch(dataSourceId, config, input);
    return source.kind === 'external'
      ? executeExternalSearch(source, searchConfig, searchInput)
      : executeManagedSearch(source, searchConfig, searchInput);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Data source search failed', error as Error, { dataSourceId });
    return { success: false, error: message };
  }
}

// ============================================================================
// MANAGED SEARCH
// ============================================================================

async function executeManagedSearch(
  source: ResolvedManagedSource,
  config: SearchConfig,
  input: SearchInput,
): Promise<OperationResult> {
  const query = input.query ?? '';
  const maxResults = config.maxResults ?? 10;

  const merged = mergeDefaultFilters(config.defaultFilters, buildFilterClauses(input.filters));
  const sorting = mergeDefaultSort(config.defaultSort, buildSortClauses(input.sort));

  const response = await searchService.searchById(source.searchIndexId, {
    query,
    pageSize: maxResults,
    filters: merged.filters.length > 0 ? merged.filters : undefined,
    sort: sorting.sort.length > 0 ? sorting.sort : undefined,
  });

  return {
    success: true,
    data: {
      results: response.hits.map((hit) => ({
        id: hit.id,
        score: hit.score,
        data: projectFields(hit.source, config.responseFields),
        ...(config.includeHighlights !== false && hit.highlights ? { highlights: hit.highlights } : {}),
      })),
      totalCount: response.total.value,
      took: response.took,
      ...(response.facets?.length ? {
        facets: response.facets.map(f => ({
          field: f.field,
          buckets: f.buckets.map(b => ({
            value: b.key,
            count: b.count,
          })),
        })),
      } : {}),
      ...describeAppliedConfig(merged.appliedDefaults, sorting),
    },
  };
}

// ============================================================================
// EXTERNAL SEARCH
// ============================================================================

async function executeExternalSearch(
  source: ResolvedExternalSource,
  config: SearchConfig,
  input: SearchInput,
): Promise<OperationResult> {
  const query = input.query ?? '';
  const maxResults = Number(config.maxResults ?? 10);
  const startTime = Date.now();

  // The discovered schema drives both highlighting and filter/sort translation, so it is
  // fetched once here. A missing schema is not fatal: translation falls back to
  // best-effort (see external-query.ts) rather than dropping what was requested.
  let schemaFields: DataSourceField[] | undefined;
  try {
    const ds = await dataSourceService.getDataSourceById(source.dataSourceId);
    if (ds?.schema) {
      schemaFields = (ds.schema as DataSourceSchema).fields;
    }
  } catch {
    // Non-critical — proceed without schema-derived highlights or field validation.
  }

  let highlightFields: string | undefined;
  if (config.includeHighlights !== false && schemaFields?.length) {
    const searchable = schemaFields
      .filter(f => f.isSearchable && f.type !== 'vector')
      .map(f => f.name);
    if (searchable.length > 0) {
      highlightFields = searchable.join(',');
    }
  }

  const merged = mergeDefaultFilters(config.defaultFilters, buildFilterClauses(input.filters));
  const sorting = mergeDefaultSort(config.defaultSort, buildSortClauses(input.sort));
  const translatedFilters = translateFilters(source.provider, merged.filters, schemaFields);
  const translatedSort = translateSort(source.provider, sorting.sort, schemaFields);

  let result: OperationResult;
  switch (source.provider) {
    case 'azure-ai-search':
      result = await callAzureAISearch(
        { endpoint: source.endpoint, indexName: source.indexName, apiKey: source.apiKey },
        {
          query,
          maxResults,
          includeHighlights: !!highlightFields,
          highlightFields,
          selectFields: config.responseFields,
          filter: translatedFilters.odata,
          orderBy: translatedSort.odataOrderBy,
        },
      );
      break;

    case 'elasticsearch':
      result = await callElasticsearchSearch(
        { endpoint: source.endpoint, indexName: source.indexName, apiKey: source.apiKey, authType: source.authType },
        {
          query,
          maxResults,
          includeHighlights: !!highlightFields,
          highlightFields,
          searchFields: highlightFields,
          selectFields: config.responseFields,
          filterClauses: translatedFilters.esClauses,
          sort: translatedSort.esSort,
        },
      );
      break;

    default:
      return {
        success: false,
        error: `Executor for provider '${source.provider}' is not yet implemented`,
      };
  }

  // Report what configuration and translation did to the request. A filter that was
  // requested but not applied has to reach the caller, or a wrong answer looks correct.
  logUnapplied(translatedFilters.unapplied, translatedSort.unapplied);
  result = annotateResult(result, merged.appliedDefaults, sorting, translatedFilters.unapplied, translatedSort.unapplied);

  // Fire-and-forget analytics tracking for external searches
  const durationMs = Date.now() - startTime;
  const { getExperienceContext } = await import('@/features/search/search.service');
  const ctx = getExperienceContext();
  const resultData = result.data as { results?: unknown[]; totalCount?: number } | undefined;

  trackSearch({
    requestId: crypto.randomUUID(),
    triggerType: 'ai_tool',
    searchType: 'hybrid',
    indexIds: [],
    experienceId: ctx?.experienceId,
    experienceSlug: ctx?.experienceSlug,
    queryText: query,
    totalResults: resultData?.totalCount ?? 0,
    resultsReturned: resultData?.results?.length ?? 0,
    durationMs,
    success: result.success,
    errorMessage: result.success ? undefined : result.error,
  });

  return result;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Log anything the provider could not express. The result payload carries this to the
 * model; the log is for the operator debugging why a filter had no effect.
 */
function logUnapplied(unappliedFilters: UnappliedClause[], unappliedSort: UnappliedClause[]): void {
  if (unappliedFilters.length === 0 && unappliedSort.length === 0) return;
  logger.warn('External search could not apply part of the request', {
    unappliedFilters: unappliedFilters.map(u => `${u.field}: ${u.reason}`),
    unappliedSort: unappliedSort.map(u => `${u.field}: ${u.reason}`),
  });
}

/**
 * Project (filter) a result object to only the specified fields.
 * Returns the original object unchanged when no responseFields are configured.
 */
function projectFields(
  source: Record<string, unknown>,
  responseFields?: string[],
): Record<string, unknown> {
  if (!responseFields?.length) return source;

  const projected: Record<string, unknown> = {};
  for (const field of responseFields) {
    if (field in source) {
      projected[field] = source[field];
    }
  }
  // Always include id if present
  if (source.id !== undefined && !projected.id) projected.id = source.id;
  return projected;
}
