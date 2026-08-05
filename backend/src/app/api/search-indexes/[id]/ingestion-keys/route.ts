// app/api/search-indexes/[id]/ingestion-keys/route.ts

/**
 * Ingestion Keys API Routes
 * GET  /api/search-indexes/:id/ingestion-keys - List keys for this index
 * POST /api/search-indexes/:id/ingestion-keys - Create a key (returned once)
 *
 * Session-only: a key must not be able to mint another key.
 */

import { NextRequest } from 'next/server';
import {
    handleListIngestionKeys,
    handleCreateIngestionKey,
} from '@/features/ingestion-keys/ingestion-key.api.handlers';

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    return handleListIngestionKeys(request, context);
}

export async function POST(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    return handleCreateIngestionKey(request, context);
}
