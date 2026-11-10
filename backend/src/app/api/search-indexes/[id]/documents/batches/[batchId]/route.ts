// app/api/search-indexes/[id]/documents/batches/[batchId]/route.ts

/**
 * Indexing Batch Status API Route
 * GET    /api/search-indexes/:id/documents/batches/:batchId - Get batch status
 * DELETE /api/search-indexes/:id/documents/batches/:batchId - Cancel batch
 */

import { NextRequest } from 'next/server';

import { forBuiltInDocumentChange } from '@/features/access/built-in';
import { withPermissionOrIngestionKey } from '@/features/access/route-guard';
import {
    handleGetBatchStatus,
    handleCancelBatch,
} from '@/features/document-indexing';

export const GET = withPermissionOrIngestionKey('search-indexes:view', async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string; batchId: string }> }
) {
    return handleGetBatchStatus(request, context);
});

export const DELETE = forBuiltInDocumentChange('documents:edit', async function DELETE(
    request: NextRequest,
    context: { params: Promise<{ id: string; batchId: string }> }
) {
    return handleCancelBatch(request, context);
});
