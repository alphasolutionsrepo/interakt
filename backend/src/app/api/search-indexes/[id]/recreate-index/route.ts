// app/api/search-indexes/[id]/recreate-index/route.ts

/**
 * Recreate Empty Index API Route
 * POST /api/search-indexes/:id/recreate-index
 */

import { NextRequest } from 'next/server';
import { handleRecreateEmptyIndex } from '@/features/search-index/search-index.api.handlers';

export async function POST(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    return handleRecreateEmptyIndex(request, context);
}
