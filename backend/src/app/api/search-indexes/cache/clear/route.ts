// app/api/search-indexes/cache/clear/route.ts

/**
 * Clear Cache API Route
 * POST /api/search-indexes/cache/clear - Clear all caches
 */

import { withPermission } from '@/features/access/route-guard';
import { handleClearCache } from '@/features/search-index/search-index.api.handlers';

export const POST = withPermission('settings:manage', async function POST() {
    return handleClearCache();
});