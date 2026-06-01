// app/api/search-indexes/[id]/fields/[fieldId]/distinct-values/route.ts

/**
 * Distinct Values API Route
 * GET /api/search-indexes/:id/fields/:fieldId/distinct-values
 *
 * Returns the distinct indexed values for a facetable field.
 * Used for auto-generating filter canonical value mappings.
 */

import { NextRequest } from 'next/server';
import { handleGetFieldDistinctValues } from '@/features/search-index/search-index.api.handlers';

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string; fieldId: string }> }
) {
    return handleGetFieldDistinctValues(request, context);
}
