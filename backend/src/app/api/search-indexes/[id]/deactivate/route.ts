// app/api/search-indexes/[id]/deactivate/route.ts

/**
 * Deactivate Search Index API Route
 * PATCH /api/search-indexes/:id/deactivate - Deactivate a search index
 */

import { NextRequest } from 'next/server';

import { forBuiltInChange } from '@/features/access/built-in';
import { handleDeactivateSearchIndex } from '@/features/search-index/search-index.api.handlers';

export const PATCH = forBuiltInChange('search-index', 'search-indexes:edit', async function PATCH(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    return handleDeactivateSearchIndex(request, context);
});