// app/api/search-indexes/[id]/fields/mappings/route.ts

/**
 * Search Index Field Mappings API Route
 * PUT    /api/search-indexes/:id/fields/mappings - Bulk update field mappings
 * DELETE /api/search-indexes/:id/fields/mappings - Clear all field mappings
 */

import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import {
    handleBulkUpdateMappings,
    handleClearMappings,
} from '@/features/search-index/search-index.api.handlers';

export const PUT = withPermission('search-indexes:edit', async function PUT(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    return handleBulkUpdateMappings(request, context);
});

export const DELETE = withPermission('search-indexes:edit', async function DELETE(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    return handleClearMappings(request, context);
});