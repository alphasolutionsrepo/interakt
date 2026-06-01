// app/api/search-indexes/name/[name]/route.ts

/**
 * Get Search Index by Name API Route
 * GET /api/search-indexes/name/:name - Get search index by name
 */

import { NextRequest } from 'next/server';
import { handleGetSearchIndexByName } from '@/features/search-index/search-index.api.handlers';

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ name: string }> }
) {
    return handleGetSearchIndexByName(request, context);
}