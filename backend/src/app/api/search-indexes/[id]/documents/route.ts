// app/api/search-indexes/[id]/documents/route.ts

/**
 * Document Indexing API Route
 * GET  /api/search-indexes/:id/documents - Page through indexed documents
 * POST /api/search-indexes/:id/documents - Upload and index documents
 */

import { NextRequest } from 'next/server';
import { handleListDocuments, handleIndexDocuments } from '@/features/document-indexing';
import { withRateLimit } from '@/shared/api/rate-limit';
import { ingestionRateLimitKey } from '@/features/ingestion-keys';

// Route segment config for App Router
// Note: Body size limit is configured in next.config.ts via serverActions.bodySizeLimit
// For API routes, body parsing is handled automatically by Next.js
export const dynamic = 'force-dynamic';

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    return handleListDocuments(request, context);
}

/**
 * Rate limited per ingestion key. Bulk uploads are large and infrequent, so a
 * modest ceiling is plenty and keeps a misconfigured sink from hammering the
 * embedding provider.
 */
export const POST = withRateLimit(
    async (request: NextRequest, context: { params: Promise<{ id: string }> }) =>
        handleIndexDocuments(request, context),
    { maxRequests: 30, windowMs: 60_000, keyFn: ingestionRateLimitKey }
);
