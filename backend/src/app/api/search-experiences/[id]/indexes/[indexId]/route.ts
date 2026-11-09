// app/api/search-experiences/[id]/indexes/[indexId]/route.ts

/**
 * Search Experience Index by ID API Route
 *
 * PUT    /api/search-experiences/:id/indexes/:indexId - Update an index
 * DELETE /api/search-experiences/:id/indexes/:indexId - Remove an index
 */

import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import {
  handleUpdateIndex,
  handleRemoveIndex,
} from '@/features/search-experience/search-experience.admin.handlers';

export const PUT = withPermission('search-experiences:edit', async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string; indexId: string }> }
) {
  return handleUpdateIndex(request, context);
});

export const DELETE = withPermission('search-experiences:edit', async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; indexId: string }> }
) {
  return handleRemoveIndex(request, context);
});
