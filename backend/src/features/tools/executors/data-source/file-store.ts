// src/features/tools/executors/data-source/file-store.ts

/**
 * File Store Executor — Domain Knowledge Base (Sprint 6 / Phase E)
 *
 * Handles `search` and `lookup` operations on file_store data sources.
 * Uses hybrid search: semantic (pgvector cosine) + keyword (ILIKE) fallback.
 *
 * This executor is called from the data-source search/lookup dispatchers
 * when the resolved data source is of type 'file_store'.
 */

import { embed } from '@/features/embedding/embedding.service';
import * as kbRepository from '@/features/knowledge-base/knowledge-base.repository';
import { createLogger } from '@/shared/logger/logger';
import type { OperationResult } from './shared';

const logger = createLogger('file-store-executor');

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;
const MAX_DISTANCE = 0.45;

// ============================================================================
// SEARCH
// ============================================================================

interface SearchInput {
  query?: string;
  maxResults?: number;
}

/**
 * Semantic + keyword hybrid search over knowledge chunks.
 * Returns top-K relevant chunks with source document attribution.
 */
export async function executeFileStoreSearch(
  dataSourceId: string,
  config: Record<string, unknown>,
  input: Record<string, unknown>,
): Promise<OperationResult> {
  const searchInput = input as unknown as SearchInput;
  const query = typeof searchInput.query === 'string' ? searchInput.query.trim() : '';

  if (!query) {
    return { success: false, error: 'Missing required input field: "query"' };
  }

  const limit = Math.min(
    typeof searchInput.maxResults === 'number'
      ? Math.max(1, Math.floor(searchInput.maxResults))
      : (config.maxResults as number | undefined) ?? DEFAULT_LIMIT,
    MAX_LIMIT,
  );

  try {
    // Strategy: semantic first, merge keyword results for any gap
    const vectorResults = await tryVectorSearch(dataSourceId, query, limit);
    const keywordResults = await kbRepository.keywordSearchChunks(dataSourceId, query, limit);

    // Merge: vector results first (ranked by similarity), then non-duplicate keyword results
    const seenIds = new Set<string>();
    const merged: Array<{
      id: string;
      content: string;
      chunkIndex: number;
      documentId: string;
      documentName: string;
      source: 'semantic' | 'keyword';
    }> = [];

    for (const r of vectorResults) {
      seenIds.add(r.id);
      merged.push({
        id: r.id,
        content: r.content,
        chunkIndex: r.chunkIndex,
        documentId: r.documentId,
        documentName: r.documentName,
        source: 'semantic',
      });
    }

    for (const r of keywordResults) {
      if (!seenIds.has(r.id) && merged.length < limit) {
        seenIds.add(r.id);
        merged.push({
          id: r.id,
          content: r.content,
          chunkIndex: r.chunkIndex,
          documentId: r.documentId,
          documentName: r.documentName,
          source: 'keyword',
        });
      }
    }

    if (merged.length === 0) {
      return {
        success: true,
        data: {
          results: [],
          totalCount: 0,
          message: 'No relevant content found in the knowledge base.',
        },
      };
    }

    return {
      success: true,
      data: {
        results: merged.map(r => ({
          id: r.id,
          content: r.content,
          chunkIndex: r.chunkIndex,
          documentId: r.documentId,
          documentName: r.documentName,
          source: r.source,
        })),
        totalCount: merged.length,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('File store search failed', error as Error, { dataSourceId });
    return { success: false, error: message };
  }
}

// ============================================================================
// LOOKUP
// ============================================================================

interface LookupInput {
  id?: string;
}

/**
 * Retrieve a specific chunk by ID from a file_store data source.
 */
export async function executeFileStoreLookup(
  dataSourceId: string,
  _config: Record<string, unknown>,
  input: Record<string, unknown>,
): Promise<OperationResult> {
  const lookupInput = input as unknown as LookupInput;
  const chunkId = typeof lookupInput.id === 'string' ? lookupInput.id.trim() : '';

  if (!chunkId) {
    return { success: false, error: 'Missing required input field: "id"' };
  }

  try {
    const chunk = await kbRepository.getChunkById(chunkId);

    if (!chunk) {
      return { success: false, error: `Chunk not found: ${chunkId}` };
    }

    // Verify the chunk belongs to this data source (authorization guard)
    if (chunk.dataSourceId !== dataSourceId) {
      return { success: false, error: `Chunk not found: ${chunkId}` };
    }

    return {
      success: true,
      data: {
        document: {
          id: chunk.id,
          content: chunk.content,
          chunkIndex: chunk.chunkIndex,
          documentId: chunk.documentId,
        },
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('File store lookup failed', error as Error, { dataSourceId, chunkId });
    return { success: false, error: message };
  }
}

// ============================================================================
// HELPERS
// ============================================================================

async function tryVectorSearch(
  dataSourceId: string,
  query: string,
  limit: number,
): Promise<Array<Awaited<ReturnType<typeof kbRepository.searchChunks>>[number]>> {
  try {
    const queryVector = await embed(query, { feature: 'knowledge_search' } as any);
    if (!queryVector) return [];
    return kbRepository.searchChunks(dataSourceId, queryVector, limit, MAX_DISTANCE);
  } catch {
    return [];
  }
}
