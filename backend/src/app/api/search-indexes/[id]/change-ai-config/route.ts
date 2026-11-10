// app/api/search-indexes/[id]/change-ai-config/route.ts

/**
 * Search Index AI Configuration Change API Route
 * POST /api/search-indexes/:id/change-ai-config - Change AI provider/model/dimensions
 *
 * WARNING: This is a destructive operation that deletes the ES index
 */

import { NextRequest } from 'next/server';

import { forBuiltInChange } from '@/features/access/built-in';
import { handleChangeAIConfig } from '@/features/search-index/search-index.api.handlers';

export const POST = forBuiltInChange('search-index', 'search-indexes:edit', async function POST(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    return handleChangeAIConfig(request, context);
});
