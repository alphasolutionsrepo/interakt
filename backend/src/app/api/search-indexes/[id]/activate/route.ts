// app/api/search-indexes/[id]/activate/route.ts

/**
 * Activate Search Index API Route
 * PATCH /api/search-indexes/:id/activate - Activate a search index
 */

import { NextRequest } from 'next/server';
import { handleActivateSearchIndex } from '@/features/search-index/search-index.api.handlers';

export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    return handleActivateSearchIndex(request, context);
}