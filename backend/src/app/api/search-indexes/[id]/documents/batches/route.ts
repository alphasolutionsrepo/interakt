// app/api/search-indexes/[id]/documents/batches/route.ts

/**
 * Indexing Batches List API Route
 * GET /api/search-indexes/:id/documents/batches - List indexing batches
 */

import { NextRequest } from 'next/server';
import { handleListBatches } from '@/features/document-indexing';

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    return handleListBatches(request, context);
}
