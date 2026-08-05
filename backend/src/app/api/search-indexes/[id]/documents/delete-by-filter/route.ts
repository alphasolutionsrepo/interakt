// app/api/search-indexes/[id]/documents/delete-by-filter/route.ts

/**
 * Delete Documents By Filter API Route
 * POST /api/search-indexes/:id/documents/delete-by-filter - Delete all matching documents
 *
 * Filters use the same syntax as the search API. Pass `dryRun: true` to get the
 * matched count without deleting anything.
 *
 * POST rather than DELETE because request bodies on DELETE are unreliable
 * through proxies and some fetch implementations.
 */

import { NextRequest } from 'next/server';
import { handleDeleteDocumentsByFilter } from '@/features/document-indexing';
import { withRateLimit } from '@/shared/api/rate-limit';
import { ingestionRateLimitKey } from '@/features/ingestion-keys';

export const dynamic = 'force-dynamic';

// Rate limited per ingestion key. Tighter than the other write routes: this one
// can remove an unbounded number of documents per call.
export const POST = withRateLimit(
    async (request: NextRequest, context: { params: Promise<{ id: string }> }) =>
        handleDeleteDocumentsByFilter(request, context),
    { maxRequests: 20, windowMs: 60_000, keyFn: ingestionRateLimitKey }
);
