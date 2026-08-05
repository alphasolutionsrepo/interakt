// app/api/search-indexes/[id]/documents/bulk/route.ts

/**
 * Bulk Incremental Write API Route
 * POST /api/search-indexes/:id/documents/bulk - Apply mixed add/update/delete operations
 *
 * For a full (re)load of an index use POST /api/search-indexes/:id/documents
 * instead — that path provisions the index and tracks progress in a batch record.
 * This route requires the index to already exist and returns its results inline.
 */

import { NextRequest } from 'next/server';
import { handleBulkWriteDocuments } from '@/features/document-indexing';
import { withRateLimit } from '@/shared/api/rate-limit';
import { ingestionRateLimitKey } from '@/features/ingestion-keys';

export const dynamic = 'force-dynamic';

// Rate limited per ingestion key — see the documents route for the rationale
export const POST = withRateLimit(
    async (request: NextRequest, context: { params: Promise<{ id: string }> }) =>
        handleBulkWriteDocuments(request, context),
    { maxRequests: 60, windowMs: 60_000, keyFn: ingestionRateLimitKey }
);
