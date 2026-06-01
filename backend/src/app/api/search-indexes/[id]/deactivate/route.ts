// app/api/search-indexes/[id]/deactivate/route.ts

/**
 * Deactivate Search Index API Route
 * PATCH /api/search-indexes/:id/deactivate - Deactivate a search index
 */

import { NextRequest } from 'next/server';
import { handleDeactivateSearchIndex } from '@/features/search-index/search-index.api.handlers';

export async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    return handleDeactivateSearchIndex(request, context);
}