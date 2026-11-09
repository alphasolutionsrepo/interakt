// app/api/search-indexes/[id]/fields/validate/route.ts

/**
 * Search Index Fields Validation API Route
 * GET /api/search-indexes/:id/fields/validate - Validate field mappings
 */

import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import { handleValidateMappings } from '@/features/search-index/search-index.api.handlers';

export const GET = withPermission('search-indexes:view', async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    return handleValidateMappings(request, context);
});