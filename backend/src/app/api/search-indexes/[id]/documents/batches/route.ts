// app/api/search-indexes/[id]/documents/batches/route.ts

/**
 * Indexing Batches List API Route
 * GET /api/search-indexes/:id/documents/batches - List indexing batches
 */

import { NextRequest } from 'next/server';

import { withPermissionOrIngestionKey } from '@/features/access/route-guard';
import { handleListBatches } from '@/features/document-indexing';

export const GET = withPermissionOrIngestionKey('search-indexes:view', async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    return handleListBatches(request, context);
});
