// app/api/search-indexes/route.ts

/**
 * Search Indexes API Routes
 * GET  /api/search-indexes - List search indexes
 * POST /api/search-indexes - Create search index
 */

import { NextRequest } from 'next/server';
import {
    handleListSearchIndexes,
    handleCreateSearchIndex,
} from '@/features/search-index/search-index.api.handlers';

export async function GET(request: NextRequest) {
    return handleListSearchIndexes(request);
}

export async function POST(request: NextRequest) {
    return handleCreateSearchIndex(request);
}