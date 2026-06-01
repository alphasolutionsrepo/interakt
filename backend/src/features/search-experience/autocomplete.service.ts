// src/features/search-experience/autocomplete.service.ts

/**
 * Autocomplete Service
 *
 * Provides autocomplete/suggestion functionality for search experiences.
 * Supports the Edge N-gram strategy using fields marked with isAutocomplete=true.
 */

import 'server-only';

import { providerRegistry, initializeSearchProviders } from '@/features/search/providers';
import type { SearchProvider } from '@/features/search/providers';
import { createLogger } from '@/shared/logger/logger';
import * as searchIndexService from '@/features/search-index/search-index.service';
import { getProviderFieldSettings } from '@/features/search-index/provider-settings.utils';
import type { SearchExperienceWithIndexes } from './search-experience.types';
import { DEFAULT_AUTOCOMPLETE_CONFIG } from './search-experience.types';

const logger = createLogger('autocomplete-service');

// ============================================================================
// TYPES
// ============================================================================

export interface AutocompleteRequest {
  /** The partial query to get suggestions for */
  query: string;
  /** Optional: limit to a specific index ID */
  indexId?: string;
  /** Max suggestions to return (overrides experience config) */
  maxSuggestions?: number;
}

export interface AutocompleteSuggestion {
  /** The suggestion text */
  text: string;
  /** Score/relevance of the suggestion */
  score: number;
  /** Source field the suggestion came from */
  field: string;
  /** Index the suggestion came from */
  indexId: string;
  /** Index display name */
  indexName: string;
  /** Optional highlight with matched portion */
  highlight?: string;
}

export interface AutocompleteResponse {
  /** List of suggestions */
  suggestions: AutocompleteSuggestion[];
  /** Original query */
  query: string;
  /** Time taken in ms */
  took: number;
}

// ============================================================================
// MAIN AUTOCOMPLETE FUNCTION
// ============================================================================

/**
 * Get autocomplete suggestions for a query
 */
export async function getAutocompleteSuggestions(
  experience: SearchExperienceWithIndexes,
  request: AutocompleteRequest
): Promise<AutocompleteResponse> {
  const startTime = Date.now();
  const config = experience.searchConfig?.autocomplete ?? DEFAULT_AUTOCOMPLETE_CONFIG;

  // Check if autocomplete is enabled
  if (!config.enabled) {
    return {
      suggestions: [],
      query: request.query,
      took: Date.now() - startTime,
    };
  }

  // Check minimum length
  if (request.query.length < config.minLength) {
    return {
      suggestions: [],
      query: request.query,
      took: Date.now() - startTime,
    };
  }

  const maxSuggestions = request.maxSuggestions ?? config.maxSuggestions;

  // Resolve indexes to search
  const indexesToSearch = resolveIndexesForAutocomplete(experience, request.indexId);

  if (indexesToSearch.length === 0) {
    logger.warn('No indexes with autocomplete fields found', {
      experienceId: experience.id,
      requestedIndexId: request.indexId,
    });
    return {
      suggestions: [],
      query: request.query,
      took: Date.now() - startTime,
    };
  }

  try {
    // Execute autocomplete queries in parallel across all indexes
    const results = await Promise.all(
      indexesToSearch.map((idx) =>
        executeAutocompleteQuery(idx, request.query, maxSuggestions)
          .catch((error) => {
            logger.error('Autocomplete query failed for index', {
              indexId: idx.indexId,
              indexName: idx.indexName,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
            return { suggestions: [] as AutocompleteSuggestion[], indexId: idx.indexId };
          })
      )
    );

    // Merge and deduplicate suggestions
    const allSuggestions = results.flatMap((r) => r.suggestions);
    const dedupedSuggestions = deduplicateSuggestions(allSuggestions, maxSuggestions);

    logger.debug('Autocomplete completed', {
      experienceId: experience.id,
      query: request.query,
      indexCount: indexesToSearch.length,
      totalSuggestions: allSuggestions.length,
      dedupedSuggestions: dedupedSuggestions.length,
      took: Date.now() - startTime,
    });

    return {
      suggestions: dedupedSuggestions,
      query: request.query,
      took: Date.now() - startTime,
    };
  } catch (error) {
    logger.error('Autocomplete failed', {
      experienceId: experience.id,
      query: request.query,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return {
      suggestions: [],
      query: request.query,
      took: Date.now() - startTime,
    };
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

interface IndexAutocompleteInfo {
  indexId: string;
  indexName: string;
  displayName: string;
  /** Provider-agnostic index name (used for search provider calls) */
  providerIndexName: string;
  /** Which search provider this index is configured for */
  searchProvider: string;
  autocompleteFields: string[];
}

/**
 * Resolve which indexes to search and their autocomplete fields
 */
function resolveIndexesForAutocomplete(
  experience: SearchExperienceWithIndexes,
  requestedIndexId?: string
): IndexAutocompleteInfo[] {
  const result: IndexAutocompleteInfo[] = [];

  // Filter to only active indexes
  let indexes = experience.indexes.filter((idx) => idx.searchIndex.isActive);

  // If specific index requested, filter to that
  if (requestedIndexId) {
    indexes = indexes.filter(
      (idx) => idx.searchIndexId === requestedIndexId || idx.searchIndex.name === requestedIndexId
    );
  }

  // For each index, we need to get its autocomplete fields
  // This will be populated by the caller or fetched separately
  for (const idx of indexes) {
    result.push({
      indexId: idx.searchIndexId,
      indexName: idx.searchIndex.name,
      displayName: idx.searchIndex.displayName,
      providerIndexName: idx.searchIndex.name,
      searchProvider: idx.searchIndex.searchProvider ?? 'elasticsearch',
      autocompleteFields: [], // Will be populated when executing query
    });
  }

  return result;
}

/**
 * Resolve the correct search provider for an index.
 * Uses the provider registry (same pattern as search.service.ts).
 */
function resolveProvider(providerName: string): SearchProvider {
  // Ensure providers are initialized (handles Next.js multi-context)
  if (providerRegistry.list().length === 0) {
    initializeSearchProviders();
  }

  const provider = providerRegistry.get(providerName);
  if (!provider) {
    throw new Error(`Search provider "${providerName}" is not registered`);
  }
  return provider;
}

/**
 * Execute autocomplete query against a single index
 */
async function executeAutocompleteQuery(
  indexInfo: IndexAutocompleteInfo,
  query: string,
  maxSuggestions: number
): Promise<{ suggestions: AutocompleteSuggestion[]; indexId: string }> {
  const provider = resolveProvider(indexInfo.searchProvider);

  // Get the search index with fields to find autocomplete fields
  const searchIndex = await searchIndexService.getSearchIndexById(indexInfo.indexId);
  if (!searchIndex) {
    logger.warn('Search index not found for autocomplete', { indexId: indexInfo.indexId });
    return { suggestions: [], indexId: indexInfo.indexId };
  }

  // Find fields flagged for autocomplete. Resolve the flag the same way index
  // creation does — via providerFieldSettings (provider-agnostic; works for ES
  // and Azure), falling back to the legacy isAutocomplete column for
  // pre-migration fields. Reading the column directly misses fields whose flag
  // only lives in providerFieldSettings (e.g. demo-seeded indexes).
  const autocompleteFields = searchIndex.fields
    .filter((f) => getProviderFieldSettings(f).isAutocomplete === true && f.isIndexed)
    .map((f) => f.fieldName);

  if (autocompleteFields.length === 0) {
    logger.debug('No autocomplete fields in index', {
      indexId: indexInfo.indexId,
      indexName: indexInfo.indexName,
    });
    return { suggestions: [], indexId: indexInfo.indexId };
  }

  try {
    // Execute autocomplete via search provider with autocomplete_search analyzer
    const result = await provider.autocomplete(
      indexInfo.providerIndexName,
      query,
      autocompleteFields,
      { maxSuggestions: maxSuggestions * 2, analyzer: 'autocomplete_search' }
    );

    const suggestions: AutocompleteSuggestion[] = [];

    for (const hit of result.hits) {
      // Extract suggestions from each autocomplete field
      for (const fieldName of autocompleteFields) {
        const value = hit.source[fieldName];
        if (typeof value === 'string' && value.trim()) {
          suggestions.push({
            text: value.trim(),
            score: hit.score,
            field: fieldName,
            indexId: indexInfo.indexId,
            indexName: indexInfo.displayName,
            highlight: hit.highlights?.[fieldName]?.[0],
          });
        }
      }
    }

    return { suggestions, indexId: indexInfo.indexId };
  } catch (error) {
    // Check if the error is due to missing analyzer (index wasn't created with autocomplete)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    if (errorMessage.includes('analyzer') && errorMessage.includes('autocomplete')) {
      logger.warn('Index missing autocomplete analyzer, falling back to standard search', {
        indexId: indexInfo.indexId,
        indexName: indexInfo.indexName,
      });

      // Fallback: use standard prefix query without custom analyzer
      return executeStandardPrefixQuery(indexInfo, query, autocompleteFields, maxSuggestions);
    }

    throw error;
  }
}

/**
 * Fallback: Execute standard prefix query for indexes without autocomplete analyzer
 */
async function executeStandardPrefixQuery(
  indexInfo: IndexAutocompleteInfo,
  query: string,
  fields: string[],
  maxSuggestions: number
): Promise<{ suggestions: AutocompleteSuggestion[]; indexId: string }> {
  const provider = resolveProvider(indexInfo.searchProvider);

  try {
    // Use provider autocomplete without custom analyzer (defaults to phrase_prefix)
    const result = await provider.autocomplete(
      indexInfo.providerIndexName,
      query,
      fields,
      { maxSuggestions: maxSuggestions * 2 }
    );

    const suggestions: AutocompleteSuggestion[] = [];

    for (const hit of result.hits) {
      for (const fieldName of fields) {
        const value = hit.source[fieldName];
        if (typeof value === 'string' && value.trim()) {
          suggestions.push({
            text: value.trim(),
            score: hit.score,
            field: fieldName,
            indexId: indexInfo.indexId,
            indexName: indexInfo.displayName,
            highlight: hit.highlights?.[fieldName]?.[0],
          });
        }
      }
    }

    return { suggestions, indexId: indexInfo.indexId };
  } catch (error) {
    logger.error('Standard prefix query failed', {
      indexId: indexInfo.indexId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return { suggestions: [], indexId: indexInfo.indexId };
  }
}

/**
 * Deduplicate suggestions by text (case-insensitive) and return top N by score
 */
function deduplicateSuggestions(
  suggestions: AutocompleteSuggestion[],
  maxSuggestions: number
): AutocompleteSuggestion[] {
  const seen = new Map<string, AutocompleteSuggestion>();

  // Sort by score descending first
  const sorted = [...suggestions].sort((a, b) => b.score - a.score);

  for (const suggestion of sorted) {
    const normalizedText = suggestion.text.toLowerCase().trim();

    // Keep the highest scoring version of each unique text
    if (!seen.has(normalizedText)) {
      seen.set(normalizedText, suggestion);
    }

    // Stop once we have enough unique suggestions
    if (seen.size >= maxSuggestions) {
      break;
    }
  }

  return Array.from(seen.values());
}
