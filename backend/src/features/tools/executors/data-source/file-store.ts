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

/**
 * Cosine-distance cutoff for the semantic pass.
 *
 * Overridable per tool via `maxDistance`, because the right value depends on the corpus: a
 * tight product catalog and a prose documentation set do not score alike.
 */
const DEFAULT_MAX_DISTANCE = 0.45;

/**
 * Second, wider pass used only when the strict one finds nothing.
 *
 * A conversational question embeds further from every individual chunk than the same question
 * stripped to keywords does — "pipeline modes" returned seven results where "pipeline modes
 * difference" returned none, from a corpus containing fifteen chunks about pipeline modes. A
 * cutoff that produces that is not protecting the answer, it is hiding the corpus.
 *
 * So a miss widens the net rather than giving up, and the result says it widened it. Returning
 * nothing lets the model report "this is not documented" when the truth is "this was not
 * retrieved" — the same confusion between absence and failure that the search relaxation
 * ladder exists to prevent.
 */
const FALLBACK_MAX_DISTANCE = 0.7;

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

  const strictDistance =
    typeof config.maxDistance === 'number' ? config.maxDistance : DEFAULT_MAX_DISTANCE;

  try {
    // Strategy: semantic first, merge keyword results for any gap
    let relaxed = false;
    let vectorResults = await tryVectorSearch(dataSourceId, query, limit, strictDistance);
    const keywordResults = await kbRepository.keywordSearchChunks(dataSourceId, query, limit);

    // Nothing at all cleared the bar — widen it once rather than reporting an empty corpus.
    if (vectorResults.length === 0 && keywordResults.length === 0) {
      const wider = Math.max(strictDistance, FALLBACK_MAX_DISTANCE);
      vectorResults = await tryVectorSearch(dataSourceId, query, limit, wider);
      relaxed = vectorResults.length > 0;
    }

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
          // Says which of the two it is. "Nothing matched" and "there is nothing on this
          // subject" are different claims, and only the first one is knowable here.
          message:
            'Nothing in the knowledge base scored close enough to this query. The subject may ' +
            'still be documented — try different wording.',
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
        // Reported so synthesis can hedge rather than present a loose match as a direct hit —
        // the same contract the search executor uses for relaxed filters.
        ...(relaxed && {
          constraintsRelaxed: true,
          relaxationNote:
            'Nothing scored above the relevance cutoff, so these are the closest passages ' +
            'found with a wider one. They may not answer the question directly.',
        }),
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
  maxDistance: number,
): Promise<Array<Awaited<ReturnType<typeof kbRepository.searchChunks>>[number]>> {
  try {
    const queryVector = await embed(query, { feature: 'knowledge_search' } as any);
    if (!queryVector) return [];
    return kbRepository.searchChunks(dataSourceId, queryVector, limit, maxDistance);
  } catch {
    return [];
  }
}
