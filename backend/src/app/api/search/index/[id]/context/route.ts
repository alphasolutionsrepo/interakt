// app/api/search/index/[id]/context/route.ts

/**
 * Search Context by Index ID API Route
 * GET /api/search/index/:id/context - Get search context for index
 */

import { NextRequest } from 'next/server';
import { handleGetSearchContextById } from '@/features/search/search.api.handlers';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const resolvedParams = await params;
    return handleGetSearchContextById(request, resolvedParams);
}
