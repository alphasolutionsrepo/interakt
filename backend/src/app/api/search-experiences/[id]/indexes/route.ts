// app/api/search-experiences/[id]/indexes/route.ts

/**
 * Search Experience Indexes API Route
 *
 * POST /api/search-experiences/:id/indexes - Add an index to a search experience
 */

import { NextRequest } from 'next/server';
import { handleAddIndex } from '@/features/search-experience/search-experience.admin.handlers';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return handleAddIndex(request, context);
}
