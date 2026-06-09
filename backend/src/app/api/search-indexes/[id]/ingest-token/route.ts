// app/api/search-indexes/[id]/ingest-token/route.ts

/**
 * Ingest Token API Routes (session-authenticated, admin UI)
 *
 * GET  /api/search-indexes/:id/ingest-token - View the index's ingestion API key
 * POST /api/search-indexes/:id/ingest-token - Rotate (regenerate) the key, revoking the old one
 *
 * The key authenticates external document uploads at
 * POST /api/v1/search-indexes/:id/documents (X-Api-Key / Authorization: Bearer).
 */

import { NextRequest } from 'next/server';
import {
    handleGetIngestToken,
    handleRegenerateIngestToken,
} from '@/features/search-index/search-index.api.handlers';

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    return handleGetIngestToken(request, context);
}

export async function POST(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    return handleRegenerateIngestToken(request, context);
}
