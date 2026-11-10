// app/api/search-indexes/[id]/sync-status/route.ts

/**
 * Search Index Sync Status API Route
 * GET /api/search-indexes/:id/sync-status - Get mapping sync status
 */

import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import { handleGetMappingSyncStatus } from '@/features/search-index/search-index.api.handlers';

export const GET = withPermission('search-indexes:view', async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    return handleGetMappingSyncStatus(request, context);
});