// app/api/search-indexes/name/[name]/route.ts

/**
 * Get Search Index by Name API Route
 * GET /api/search-indexes/name/:name - Get search index by name
 */

import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import { handleGetSearchIndexByName } from '@/features/search-index/search-index.api.handlers';

export const GET = withPermission('search-indexes:view', async function GET(
    request: NextRequest,
    context: { params: Promise<{ name: string }> }
) {
    return handleGetSearchIndexByName(request, context);
});