// app/api/search-indexes/[id]/sync-status/route.ts

/**
 * Search Index Sync Status API Route
 * GET /api/search-indexes/:id/sync-status - Get mapping sync status
 */

import { NextRequest } from 'next/server';
import { handleGetMappingSyncStatus } from '@/features/search-index/search-index.api.handlers';

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    return handleGetMappingSyncStatus(request, context);
}