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
import { apiResponse } from '@/shared/api/response';
import { readJsonBody } from '@/shared/api/read-json-body';

// ============================================================================
// TYPES
// ============================================================================

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface EntryRouteContext {
  params: Promise<{ id: string; entryId: string }>;
}

/** A knowledge entry as the request sends it: not validated beyond a create's question and answer */
interface EntryBody {
  question?: string;
  answer?: string;
  tags?: string[];
  priority?: number;
  isActive?: boolean;
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
    return apiResponse.error(error, 500, { operation: 'listKnowledgeEntries' });
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
    const body = (await readJsonBody(request)) as EntryBody & { entries?: Array<{ question: string; answer: string; tags?: string[]; priority?: number }> };

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
    return apiResponse.error(error, 500, { operation: 'createKnowledgeEntry' });
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
    return apiResponse.error(error, 500, { operation: 'getKnowledgeEntry' });
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
    const body = (await readJsonBody(request)) as EntryBody;

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
    if (error instanceof Error && error.message.includes('not found')) {
      return apiResponse.refused(error, { code: 'NOT_FOUND', message: 'Knowledge entry not found' }, { operation: 'updateKnowledgeEntry' });
    }
    return apiResponse.error(error, 500, { operation: 'updateKnowledgeEntry' });
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
    return apiResponse.error(error, 500, { operation: 'deleteKnowledgeEntry' });
  }
}
