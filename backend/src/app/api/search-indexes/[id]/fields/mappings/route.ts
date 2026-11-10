// app/api/search-indexes/[id]/fields/mappings/route.ts

/**
 * Search Index Field Mappings API Route
 * PUT    /api/search-indexes/:id/fields/mappings - Bulk update field mappings
 * DELETE /api/search-indexes/:id/fields/mappings - Clear all field mappings
 */

import { NextRequest } from 'next/server';

import { forBuiltInChange } from '@/features/access/built-in';
import {
    handleBulkUpdateMappings,
    handleClearMappings,
} from '@/features/search-index/search-index.api.handlers';

export const PUT = forBuiltInChange('search-index', 'search-indexes:edit', async function PUT(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    return handleBulkUpdateMappings(request, context);
});

export const DELETE = forBuiltInChange('search-index', 'search-indexes:edit', async function DELETE(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    return handleClearMappings(request, context);
});