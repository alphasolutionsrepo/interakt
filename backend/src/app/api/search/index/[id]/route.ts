// app/api/search/index/[id]/route.ts

/**
 * Search by Index ID API Route
 * POST /api/search/index/:id - Search documents in index
 */

import { NextRequest } from 'next/server';
import { handleSearchById } from '@/features/search/search.api.handlers';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const resolvedParams = await params;
    return handleSearchById(request, resolvedParams);
}
