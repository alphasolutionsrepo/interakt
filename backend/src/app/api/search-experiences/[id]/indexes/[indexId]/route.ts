// app/api/search-experiences/[id]/indexes/[indexId]/route.ts

/**
 * Search Experience Index by ID API Route
 *
 * PUT    /api/search-experiences/:id/indexes/:indexId - Update an index
 * DELETE /api/search-experiences/:id/indexes/:indexId - Remove an index
 */

import { NextRequest } from 'next/server';

import { forBuiltInChange } from '@/features/access/built-in';

import {
  handleUpdateIndex,
  handleRemoveIndex,
} from '@/features/search-experience/search-experience.admin.handlers';

export const PUT = forBuiltInChange('search-experience', 'search-experiences:edit', async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string; indexId: string }> }
) {
  return handleUpdateIndex(request, context);
});

export const DELETE = forBuiltInChange('search-experience', 'search-experiences:edit', async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; indexId: string }> }
) {
  return handleRemoveIndex(request, context);
});
