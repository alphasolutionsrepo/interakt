// app/api/search-indexes/[id]/mappings/route.ts

/**
 * Field Mappings API Routes (within search index context)
 * 
 * UPDATED: POST removed - fields are now created via snapshot at index creation
 * Use PUT /api/search-indexes/:id/fields/mappings for bulk mapping updates
 * 
 * GET  /api/search-indexes/:id/mappings - Get all fields (backward compat)
 * PUT  /api/search-indexes/:id/mappings - Bulk update mappings (backward compat)
 */

import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import {
    handleGetFieldMappings,
    handleReplaceFieldMappings,
} from '@/features/search-index/search-index.api.handlers';

export const GET = withPermission('search-indexes:view', async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    return handleGetFieldMappings(request, context);
});

export const PUT = withPermission('search-indexes:edit', async function PUT(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    return handleReplaceFieldMappings(request, context);
});