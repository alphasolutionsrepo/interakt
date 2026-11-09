// app/api/search-indexes/all/route.ts

/**
 * Get All Active Search Indexes API Route
 * GET /api/search-indexes/all - Get all active indexes (for dropdowns)
 */

import { withPermission } from '@/features/access/route-guard';
import { handleGetAllActiveSearchIndexes } from '@/features/search-index/search-index.api.handlers';

export const GET = withPermission('search-indexes:view', async function GET() {
    return handleGetAllActiveSearchIndexes();
});