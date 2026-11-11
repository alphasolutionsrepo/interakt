// app/api/search-indexes/route.ts

/**
 * Search Indexes API Routes
 * GET  /api/search-indexes - List search indexes
 * POST /api/search-indexes - Create search index
 */

import { NextRequest } from 'next/server';

import { PICKER_READERS } from '@/features/access/permissions';
import { withPermission } from '@/features/access/route-guard';
import {
    handleListSearchIndexes,
    handleCreateSearchIndex,
} from '@/features/search-index/search-index.api.handlers';

export const GET = withPermission(PICKER_READERS.indexes, async function GET(request: NextRequest) {
    return handleListSearchIndexes(request);
});

export const POST = withPermission('search-indexes:edit', async function POST(request: NextRequest) {
    return handleCreateSearchIndex(request);
});