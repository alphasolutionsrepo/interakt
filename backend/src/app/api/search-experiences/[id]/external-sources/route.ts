// app/api/search-experiences/[id]/external-sources/route.ts

/**
 * Search Experience External Sources API Route
 *
 * POST /api/search-experiences/:id/external-sources - Attach an external index
 */

import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import { handleAddExternalSource } from '@/features/search-experience/search-experience.admin.handlers';

export const POST = withPermission('search-experiences:edit', async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return handleAddExternalSource(request, context);
});
