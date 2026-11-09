// app/api/search/health/route.ts

/**
 * Search Health Check API Route
 * GET /api/search/health - Check search service health
 */

import { withPermission } from '@/features/access/route-guard';
import { handleHealthCheck } from '@/features/search/search.api.handlers';

export const GET = withPermission('signed-in', async function GET() {
    return handleHealthCheck();
});
