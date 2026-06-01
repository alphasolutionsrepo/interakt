// app/api/search-indexes/[id]/fields/from-mapping/route.ts

/**
 * Create Fields from Exported Mapping JSON Route
 * POST /api/search-indexes/:id/fields/from-mapping
 *
 * Used by the "Import Field Mappings" dialog when the JSON has fields that
 * don't yet exist in the index. Each entry's full mapping config (mode,
 * computed, staticValue, sourceFromField) and attributes are applied on
 * create — no follow-up update needed.
 */

import { NextRequest } from 'next/server';
import { handleCreateFieldsFromMapping } from '@/features/search-index/search-index.api.handlers';

export async function POST(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    return handleCreateFieldsFromMapping(request, context);
}
