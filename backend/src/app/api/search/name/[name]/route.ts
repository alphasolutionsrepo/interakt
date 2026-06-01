// app/api/search/name/[name]/route.ts

/**
 * Search by Index Name API Route
 * POST /api/search/name/:name - Search documents in index by name
 */

import { NextRequest } from 'next/server';
import { handleSearchByName } from '@/features/search/search.api.handlers';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ name: string }> }
) {
    const resolvedParams = await params;
    return handleSearchByName(request, resolvedParams);
}
