// app/api/search-indexes/[id]/fields/summary/route.ts

/**
 * Search Index Fields Summary API Route
 * GET /api/search-indexes/:id/fields/summary - Get field mapping summary
 */

import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import { handleGetFieldsSummary } from '@/features/search-index/search-index.api.handlers';

export const GET = withPermission('search-indexes:view', async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    return handleGetFieldsSummary(request, context);
});