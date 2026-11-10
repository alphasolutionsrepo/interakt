// app/api/search-experiences/[id]/external-sources/[dataSourceId]/route.ts

/**
 * Search Experience External Source by ID API Route
 *
 * DELETE /api/search-experiences/:id/external-sources/:dataSourceId - Detach an external index
 */

import { NextRequest } from 'next/server';

import { forBuiltInChange } from '@/features/access/built-in';

import { handleRemoveExternalSource } from '@/features/search-experience/search-experience.admin.handlers';

export const DELETE = forBuiltInChange('search-experience', 'search-experiences:edit', async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; dataSourceId: string }> }
) {
  return handleRemoveExternalSource(request, context);
});
