// app/api/search-indexes/[id]/fields/validate/route.ts

/**
 * Search Index Fields Validation API Route
 * GET /api/search-indexes/:id/fields/validate - Validate field mappings
 */

import { NextRequest } from 'next/server';
import { handleValidateMappings } from '@/features/search-index/search-index.api.handlers';

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    return handleValidateMappings(request, context);
}