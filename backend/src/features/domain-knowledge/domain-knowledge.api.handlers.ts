// src/features/domain-knowledge/domain-knowledge.api.handlers.ts

/**
 * Domain Knowledge API Handlers
 *
 * Request handlers for knowledge management endpoints.
 * These are called from the Next.js API routes.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  createKnowledgeEntry,
  getKnowledgeEntryById,
  getKnowledgeEntriesBySearchIndex,
  updateKnowledgeEntry,
  deleteKnowledgeEntry,
  countKnowledgeEntries,
  bulkCreateKnowledgeEntries,
} from './domain-knowledge.service';
import { createLogger } from '@/shared/logger/logger';

const logger = createLogger('domain-knowledge-api');

// ============================================================================
// TYPES
// ============================================================================

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface EntryRouteContext {
  params: Promise<{ id: string; entryId: string }>;
}

// ============================================================================
// LIST & CREATE - /api/search-indexes/[id]/knowledge
// ============================================================================

/**
 * GET /api/search-indexes/:id/knowledge
 * List all knowledge entries for a search index
 */
export async function handleListKnowledgeEntries(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const { id: searchIndexId } = await context.params;

    // Parse query params
    const url = new URL(request.url);
    const activeOnly = url.searchParams.get('activeOnly') === 'true';

    const entries = await getKnowledgeEntriesBySearchIndex(searchIndexId, {
      activeOnly,
    });

    const total = await countKnowledgeEntries(searchIndexId);

    return NextResponse.json({
      success: true,
      data: {
        entries,
        total,
        searchIndexId,
      },
    });
  } catch (error) {
    logger.error('Failed to list knowledge entries', error as Error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list knowledge entries',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/search-indexes/:id/knowledge
 * Create a new knowledge entry (or bulk create)
 */
export async function handleCreateKnowledgeEntry(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  try {
    const { id: searchIndexId } = await context.params;
    const body = await request.json();

    // Check if bulk create
    if (Array.isArray(body.entries)) {
      const result = await bulkCreateKnowledgeEntries(
        searchIndexId,
        body.entries.map((e: { question: string; answer: string; tags?: string[]; priority?: number }) => ({
          question: e.question,
          answer: e.answer,
          tags: e.tags,
          priority: e.priority,
        }))
      );

      return NextResponse.json({
        success: true,
        data: {
          created: result.created,
          syncResult: result.syncResult,
        },
      });
    }

    // Single entry create
    const { question, answer, tags, priority } = body;

    if (!question || !answer) {
      return NextResponse.json(
        {
          success: false,
          error: 'question and answer are required',
        },
        { status: 400 }
      );
    }

    const entry = await createKnowledgeEntry({
      searchIndexId,
      question,
      answer,
      tags,
      priority,
    });

    return NextResponse.json({
      success: true,
      data: entry,
    });
  } catch (error) {
    logger.error('Failed to create knowledge entry', error as Error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create knowledge entry',
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// SINGLE ENTRY - /api/search-indexes/[id]/knowledge/[entryId]
// ============================================================================

/**
 * GET /api/search-indexes/:id/knowledge/:entryId
 * Get a single knowledge entry
 */
export async function handleGetKnowledgeEntry(
  _request: NextRequest,
  context: EntryRouteContext
): Promise<NextResponse> {
  try {
    const { entryId } = await context.params;

    const entry = await getKnowledgeEntryById(entryId);

    if (!entry) {
      return NextResponse.json(
        {
          success: false,
          error: 'Knowledge entry not found',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: entry,
    });
  } catch (error) {
    logger.error('Failed to get knowledge entry', error as Error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get knowledge entry',
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/search-indexes/:id/knowledge/:entryId
 * Update a knowledge entry
 */
export async function handleUpdateKnowledgeEntry(
  request: NextRequest,
  context: EntryRouteContext
): Promise<NextResponse> {
  try {
    const { entryId } = await context.params;
    const body = await request.json();

    const { question, answer, tags, priority, isActive } = body;

    const entry = await updateKnowledgeEntry(entryId, {
      question,
      answer,
      tags,
      priority,
      isActive,
    });

    return NextResponse.json({
      success: true,
      data: entry,
    });
  } catch (error) {
    logger.error('Failed to update knowledge entry', error as Error);

    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json(
        {
          success: false,
          error: 'Knowledge entry not found',
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update knowledge entry',
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/search-indexes/:id/knowledge/:entryId
 * Delete a knowledge entry
 */
export async function handleDeleteKnowledgeEntry(
  _request: NextRequest,
  context: EntryRouteContext
): Promise<NextResponse> {
  try {
    const { entryId } = await context.params;

    await deleteKnowledgeEntry(entryId);

    return NextResponse.json({
      success: true,
      data: { deleted: true },
    });
  } catch (error) {
    logger.error('Failed to delete knowledge entry', error as Error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete knowledge entry',
      },
      { status: 500 }
    );
  }
}
