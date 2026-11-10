// app/api/search-indexes/[id]/ingestion-keys/route.ts

/**
 * Ingestion Keys API Routes
 * GET  /api/search-indexes/:id/ingestion-keys - List keys for this index
 * POST /api/search-indexes/:id/ingestion-keys - Create a key (returned once)
 *
 * Session-only: a key must not be able to mint another key.
 */

import { NextRequest } from 'next/server';

import { forBuiltInChange } from '@/features/access/built-in';
import { withPermission } from '@/features/access/route-guard';
import {
    handleListIngestionKeys,
    handleCreateIngestionKey,
} from '@/features/ingestion-keys/ingestion-key.api.handlers';

export const GET = withPermission('secrets:manage', async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    return handleListIngestionKeys(request, context);
});

export const POST = forBuiltInChange('search-index', 'secrets:manage', async function POST(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    return handleCreateIngestionKey(request, context);
});
