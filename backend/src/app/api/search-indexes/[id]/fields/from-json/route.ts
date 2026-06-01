// app/api/search-indexes/[id]/fields/from-json/route.ts

/**
 * Create Fields from JSON API Route
 * POST /api/search-indexes/:id/fields/from-json - Create fields from sample JSON
 */

import { NextRequest } from 'next/server';
import { handleCreateFieldsFromJson } from '@/features/search-index/search-index.api.handlers';

export async function POST(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    return handleCreateFieldsFromJson(request, context);
}
