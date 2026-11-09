// app/api/search-indexes/[id]/knowledge/[entryId]/route.ts

/**
 * Single Knowledge Entry API Routes
 * GET    /api/search-indexes/:id/knowledge/:entryId - Get entry
 * PUT    /api/search-indexes/:id/knowledge/:entryId - Update entry
 * DELETE /api/search-indexes/:id/knowledge/:entryId - Delete entry
 */

import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import {
  handleGetKnowledgeEntry,
  handleUpdateKnowledgeEntry,
  handleDeleteKnowledgeEntry,
} from '@/features/domain-knowledge';

export const GET = withPermission('prompts:view', async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string; entryId: string }> }
) {
  return handleGetKnowledgeEntry(request, context);
});

export const PUT = withPermission('prompts:edit', async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string; entryId: string }> }
) {
  return handleUpdateKnowledgeEntry(request, context);
});

export const DELETE = withPermission('prompts:edit', async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; entryId: string }> }
) {
  return handleDeleteKnowledgeEntry(request, context);
});
