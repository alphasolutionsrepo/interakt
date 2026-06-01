// app/api/search-indexes/[id]/documents/route.ts

/**
 * Document Indexing API Route
 * POST /api/search-indexes/:id/documents - Upload and index documents
 */

import { NextRequest } from 'next/server';
import { handleIndexDocuments } from '@/features/document-indexing';

// Route segment config for App Router
// Note: Body size limit is configured in next.config.ts via serverActions.bodySizeLimit
// For API routes, body parsing is handled automatically by Next.js
export const dynamic = 'force-dynamic';

export async function POST(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    return handleIndexDocuments(request, context);
}
