// app/api/search-indexes/cache/stats/route.ts

/**
 * Cache Stats API Route
 * GET /api/search-indexes/cache/stats - Get cache statistics
 */

import { withPermission } from '@/features/access/route-guard';
import { handleGetCacheStats } from '@/features/search-index/search-index.api.handlers';

export const GET = withPermission('settings:view', async function GET() {
    return handleGetCacheStats();
});