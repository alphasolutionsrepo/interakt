// app/api/search-indexes/[id]/reindex/route.ts

/**
 * Trigger Reindex API Route
 * POST /api/search-indexes/:id/reindex - Trigger reindex
 */

import { NextRequest } from 'next/server';

import { forBuiltInChange } from '@/features/access/built-in';
import { handleTriggerReindex } from '@/features/search-index/search-index.api.handlers';

export const POST = forBuiltInChange('search-index', 'documents:edit', async function POST(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    return handleTriggerReindex(request, context);
});