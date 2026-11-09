// app/api/search-indexes/[id]/recreate-index/route.ts

/**
 * Recreate Empty Index API Route
 * POST /api/search-indexes/:id/recreate-index
 */

import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import { handleRecreateEmptyIndex } from '@/features/search-index/search-index.api.handlers';

export const POST = withPermission('documents:edit', async function POST(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    return handleRecreateEmptyIndex(request, context);
});
