// app/api/search-indexes/[id]/fields/additional-data/route.ts

/**
 * Additional Data Config API Route
 * PUT /api/search-indexes/:id/fields/additional-data - Update additionalData config
 * 
 * Used to configure which unmapped source fields to collect into additionalData
 */

import { NextRequest } from 'next/server';
import { handleUpdateAdditionalDataConfig } from '@/features/search-index/search-index.api.handlers';

export async function PUT(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    return handleUpdateAdditionalDataConfig(request, context);
}