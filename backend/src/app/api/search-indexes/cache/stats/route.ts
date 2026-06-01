// app/api/search-indexes/cache/stats/route.ts

/**
 * Cache Stats API Route
 * GET /api/search-indexes/cache/stats - Get cache statistics
 */

import { handleGetCacheStats } from '@/features/search-index/search-index.api.handlers';

export async function GET() {
    return handleGetCacheStats();
}