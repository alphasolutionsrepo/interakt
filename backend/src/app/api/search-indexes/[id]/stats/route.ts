// app/api/search-indexes/[id]/stats/route.ts

/**
 * Search Index Stats API Route
 * GET /api/search-indexes/:id/stats - Get index statistics
 */

import { NextRequest } from 'next/server';
import { handleGetIndexStats } from '@/features/search-index/search-index.api.handlers';

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    return handleGetIndexStats(request, context);
}