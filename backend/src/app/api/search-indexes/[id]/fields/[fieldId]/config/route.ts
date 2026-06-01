// app/api/search-indexes/[id]/fields/[fieldId]/config/route.ts

/**
 * Field Mapping Config API Route
 * PUT /api/search-indexes/:id/fields/:fieldId/config - Update field mapping config
 * 
 * Used to set mapping mode, static values, generators, etc.
 */

import { NextRequest } from 'next/server';
import { handleUpdateFieldMappingConfig } from '@/features/search-index/search-index.api.handlers';

export async function PUT(
    request: NextRequest,
    context: { params: Promise<{ id: string; fieldId: string }> }
) {
    return handleUpdateFieldMappingConfig(request, context);
}