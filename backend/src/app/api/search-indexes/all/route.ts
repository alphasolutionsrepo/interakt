// app/api/search-indexes/all/route.ts

/**
 * Get All Active Search Indexes API Route
 * GET /api/search-indexes/all - Get all active indexes (for dropdowns)
 */

import { handleGetAllActiveSearchIndexes } from '@/features/search-index/search-index.api.handlers';

export async function GET() {
    return handleGetAllActiveSearchIndexes();
}