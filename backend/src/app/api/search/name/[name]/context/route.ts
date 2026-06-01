// app/api/search/name/[name]/context/route.ts

/**
 * Search Context by Index Name API Route
 * GET /api/search/name/:name/context - Get search context for index
 */

import { NextRequest } from 'next/server';
import { handleGetSearchContextByName } from '@/features/search/search.api.handlers';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ name: string }> }
) {
    const resolvedParams = await params;
    return handleGetSearchContextByName(request, resolvedParams);
}
