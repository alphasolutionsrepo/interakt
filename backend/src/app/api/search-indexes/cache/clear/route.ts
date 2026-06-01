// app/api/search-indexes/cache/clear/route.ts

/**
 * Clear Cache API Route
 * POST /api/search-indexes/cache/clear - Clear all caches
 */

import { handleClearCache } from '@/features/search-index/search-index.api.handlers';

export async function POST() {
    return handleClearCache();
}