// app/api/search-indexes/[id]/fields/from-review/route.ts

/**
 * Create Fields from Reviewed Definitions API Route
 * POST /api/search-indexes/:id/fields/from-review
 */

import { NextRequest } from 'next/server';

import { forBuiltInChange } from '@/features/access/built-in';
import { handleCreateFieldsFromReview } from '@/features/search-index/search-index.api.handlers';

export const POST = forBuiltInChange('search-index', 'search-indexes:edit', async function POST(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    return handleCreateFieldsFromReview(request, context);
});
