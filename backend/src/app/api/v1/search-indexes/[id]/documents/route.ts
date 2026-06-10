// app/api/v1/search-indexes/[id]/documents/route.ts

/**
 * Public Document Ingestion API Route
 *
 * POST /api/v1/search-indexes/:id/documents
 * Upload and index documents from external applications, authenticated by a
 * per-index ingestion API key sent as `X-Api-Key` or `Authorization: Bearer`.
 *
 * The session-authenticated equivalent (admin UI) lives at
 * /api/search-indexes/:id/documents.
 */

import { NextRequest } from 'next/server';
import { handleIngestDocuments } from '@/features/document-indexing';

export const dynamic = 'force-dynamic';

export async function POST(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    return handleIngestDocuments(request, context);
}
