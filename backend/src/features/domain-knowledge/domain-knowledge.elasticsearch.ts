// src/features/domain-knowledge/domain-knowledge.elasticsearch.ts

/**
 * Domain Knowledge Elasticsearch Utilities
 *
 * Handles Elasticsearch index management and search operations
 * for domain knowledge entries.
 *
 * Each search index gets a corresponding knowledge index:
 * - Product index: products_fashion
 * - Knowledge index: knowledge_products_fashion
 *
 * Design: Index-agnostic, works for any domain.
 */

import 'server-only';

import {
  getElasticsearchClient,
  indexExists,
  createIndex,
  deleteIndex,
  refreshIndex,
} from '@/features/search/providers/elasticsearch';
import { createLogger } from '@/shared/logger/logger';
import type {
  KnowledgeESDocument,
  KnowledgeSearchOptions,
  KnowledgeSearchResult,
  KnowledgeIndexSettings,
} from './domain-knowledge.types';

const logger = createLogger('domain-knowledge-es');

// ============================================================================
// INDEX NAMING
// ============================================================================

/**
 * Get the Elasticsearch index name for a search index's knowledge base.
 * Format: knowledge_{searchIndexId}
 */
export function getKnowledgeIndexName(searchIndexId: string): string {
  return `knowledge_${searchIndexId}`;
}

// ============================================================================
// INDEX MAPPING
// ============================================================================

/**
 * Default synonyms - kept generic, can be overridden per-index.
 */
const DEFAULT_SYNONYMS: string[] = [];

/**
 * Build the Elasticsearch mapping for a knowledge index.
 */
function buildKnowledgeIndexMapping(settings?: KnowledgeIndexSettings) {
  const synonyms = settings?.synonyms ?? DEFAULT_SYNONYMS;

  // Build filter array - only add synonym filter if we have synonyms
  const filters = ['lowercase', 'asciifolding'];
  const analyzerFilters = synonyms.length > 0
    ? ['lowercase', 'knowledge_synonym_filter', 'asciifolding']
    : filters;

  const filterConfig: Record<string, unknown> = {};
  if (synonyms.length > 0) {
    filterConfig.knowledge_synonym_filter = {
      type: 'synonym',
      synonyms: synonyms,
    };
  }

  return {
    settings: {
      number_of_shards: settings?.numberOfShards ?? 1,
      number_of_replicas: settings?.numberOfReplicas ?? 0,
      analysis: {
        analyzer: {
          knowledge_analyzer: {
            type: 'custom',
            tokenizer: 'standard',
            filter: analyzerFilters,
          },
          knowledge_search_analyzer: {
            type: 'custom',
            tokenizer: 'standard',
            filter: filters,
          },
        },
        ...(Object.keys(filterConfig).length > 0 ? { filter: filterConfig } : {}),
      },
    },
    mappings: {
      properties: {
        id: { type: 'keyword' },
        question: {
          type: 'text',
          analyzer: 'knowledge_analyzer',
          search_analyzer: 'knowledge_search_analyzer',
          boost: 2.0,
        },
        answer: {
          type: 'text',
          analyzer: 'knowledge_analyzer',
          search_analyzer: 'knowledge_search_analyzer',
        },
        tags: {
          type: 'keyword',
          // Also index as text for fuzzy matching
          fields: {
            text: {
              type: 'text',
              analyzer: 'knowledge_analyzer',
              search_analyzer: 'knowledge_search_analyzer',
            },
          },
        },
        searchableText: {
          type: 'text',
          analyzer: 'knowledge_analyzer',
          search_analyzer: 'knowledge_search_analyzer',
        },
        priority: { type: 'integer' },
        isActive: { type: 'boolean' },
      },
    },
  };
}

// ============================================================================
// INDEX MANAGEMENT
// ============================================================================

/**
 * Create a knowledge index for a search index.
 */
export async function createKnowledgeIndex(
  searchIndexId: string,
  settings?: KnowledgeIndexSettings
): Promise<{ success: boolean; error?: string }> {
  const indexName = getKnowledgeIndexName(searchIndexId);

  logger.info('Creating knowledge index', { indexName, searchIndexId });

  try {
    const exists = await indexExists(indexName);
    if (exists) {
      logger.info('Knowledge index already exists', { indexName });
      return { success: true };
    }

    const mapping = buildKnowledgeIndexMapping(settings);
    const result = await createIndex(indexName, mapping);

    if (result.success) {
      logger.info('Knowledge index created successfully', { indexName });
    } else {
      logger.error('Failed to create knowledge index', { indexName, error: result.error });
    }

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error creating knowledge index', { indexName, error: message });
    return { success: false, error: message };
  }
}

/**
 * Delete a knowledge index.
 */
export async function deleteKnowledgeIndex(
  searchIndexId: string
): Promise<{ success: boolean; error?: string }> {
  const indexName = getKnowledgeIndexName(searchIndexId);

  logger.info('Deleting knowledge index', { indexName, searchIndexId });

  try {
    const result = await deleteIndex(indexName);

    if (result.success) {
      logger.info('Knowledge index deleted', { indexName });
    }

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Error deleting knowledge index', { indexName, error: message });
    return { success: false, error: message };
  }
}

/**
 * Check if a knowledge index exists.
 */
export async function knowledgeIndexExists(searchIndexId: string): Promise<boolean> {
  const indexName = getKnowledgeIndexName(searchIndexId);
  return indexExists(indexName);
}

// ============================================================================
// DOCUMENT OPERATIONS
// ============================================================================

/**
 * Index a single knowledge entry.
 */
export async function indexKnowledgeEntry(
  searchIndexId: string,
  document: KnowledgeESDocument
): Promise<{ success: boolean; error?: string }> {
  const es = getElasticsearchClient();
  const indexName = getKnowledgeIndexName(searchIndexId);

  try {
    await es.index({
      index: indexName,
      id: document.id,
      document: document,
      refresh: true,
    });

    logger.debug('Knowledge entry indexed', {
      indexName,
      documentId: document.id,
    });

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to index knowledge entry', {
      indexName,
      documentId: document.id,
      error: message,
    });
    return { success: false, error: message };
  }
}

/**
 * Bulk index multiple knowledge entries.
 */
export async function bulkIndexKnowledgeEntries(
  searchIndexId: string,
  documents: KnowledgeESDocument[]
): Promise<{ success: boolean; indexed: number; failed: number; errors?: string[] }> {
  if (documents.length === 0) {
    return { success: true, indexed: 0, failed: 0 };
  }

  const es = getElasticsearchClient();
  const indexName = getKnowledgeIndexName(searchIndexId);

  try {
    const operations = documents.flatMap((doc) => [
      { index: { _index: indexName, _id: doc.id } },
      doc,
    ]);

    const response = await es.bulk({
      operations,
      refresh: true,
    });

    let indexed = 0;
    let failed = 0;
    const errors: string[] = [];

    if (response.items) {
      for (const item of response.items) {
        if (item.index?.error) {
          failed++;
          errors.push(item.index.error.reason || 'Unknown error');
        } else {
          indexed++;
        }
      }
    }

    logger.info('Bulk indexed knowledge entries', {
      indexName,
      total: documents.length,
      indexed,
      failed,
    });

    return {
      success: failed === 0,
      indexed,
      failed,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to bulk index knowledge entries', { indexName, error: message });
    return {
      success: false,
      indexed: 0,
      failed: documents.length,
      errors: [message],
    };
  }
}

/**
 * Remove a knowledge entry from the index.
 */
export async function removeKnowledgeEntry(
  searchIndexId: string,
  entryId: string
): Promise<{ success: boolean; error?: string }> {
  const es = getElasticsearchClient();
  const indexName = getKnowledgeIndexName(searchIndexId);

  try {
    await es.delete({
      index: indexName,
      id: entryId,
      refresh: true,
    });

    logger.debug('Knowledge entry removed', { indexName, entryId });
    return { success: true };
  } catch (error) {
    // Handle 404 (not found) as success
    if (error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 404) {
      return { success: true };
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to remove knowledge entry', { indexName, entryId, error: message });
    return { success: false, error: message };
  }
}

// ============================================================================
// SEARCH
// ============================================================================

/**
 * Search knowledge entries for a given query.
 * Uses BM25 with fuzzy matching.
 */
export async function searchKnowledge(
  searchIndexId: string,
  query: string,
  options?: KnowledgeSearchOptions
): Promise<KnowledgeSearchResult[]> {
  const es = getElasticsearchClient();
  const indexName = getKnowledgeIndexName(searchIndexId);
  const limit = options?.limit ?? 3;
  const minScore = options?.minScore ?? 1.0;

  // Check if index exists
  const exists = await indexExists(indexName);
  if (!exists) {
    logger.warn('Knowledge index does not exist', { indexName, searchIndexId });
    return [];
  }

  // Build the search query
  const searchQuery = {
    bool: {
      must: [
        {
          multi_match: {
            query: query,
            fields: [
              'question^3',      // Questions are most important
              'tags.text^4',     // Tags for concept matching
              'answer^2',        // Answers contain the facts
              'searchableText',  // Catch-all
            ],
            type: 'best_fields' as const,
            fuzziness: 'AUTO',
            operator: 'or' as const,
            minimum_should_match: '40%',
          },
        },
      ],
      filter: [
        { term: { isActive: true } },
      ],
    },
  };

  try {
    const response = await es.search({
      index: indexName,
      query: searchQuery,
      size: limit,
      min_score: minScore,
      _source: ['id', 'question', 'answer', 'tags', 'priority'],
      // Sort by score (default), then by priority
      sort: [
        { _score: { order: 'desc' } },
        { priority: { order: 'desc' } },
      ],
    });

    const results: KnowledgeSearchResult[] = [];

    for (const hit of response.hits.hits) {
      const source = hit._source as {
        id: string;
        question: string;
        answer: string;
        tags: string[];
        priority: number;
      };

      results.push({
        entry: {
          id: source.id,
          question: source.question,
          answer: source.answer,
          tags: source.tags || [],
          priority: source.priority || 0,
        },
        score: hit._score ?? 0,
      });
    }

    logger.debug('Knowledge search completed', {
      indexName,
      query,
      resultCount: results.length,
      topScore: results[0]?.score,
    });

    return results;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Knowledge search failed', { indexName, query, error: message });
    return [];
  }
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Build a KnowledgeESDocument from a database entry.
 */
export function buildKnowledgeESDocument(
  entry: {
    id: string;
    question: string;
    answer: string;
    tags: string[];
    priority: number;
    isActive: boolean;
  }
): KnowledgeESDocument {
  return {
    id: entry.id,
    question: entry.question,
    answer: entry.answer,
    tags: entry.tags,
    searchableText: [
      entry.question,
      entry.answer,
      ...entry.tags,
    ].join(' '),
    priority: entry.priority,
    isActive: entry.isActive,
  };
}

/**
 * Refresh the knowledge index to make changes searchable immediately.
 */
export async function refreshKnowledgeIndex(searchIndexId: string): Promise<boolean> {
  const indexName = getKnowledgeIndexName(searchIndexId);
  return refreshIndex(indexName);
}
