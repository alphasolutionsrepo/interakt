// app/api/search/health/route.ts

/**
 * Search Health Check API Route
 * GET /api/search/health - Check search service health
 */

import { handleHealthCheck } from '@/features/search/search.api.handlers';

export async function GET() {
    return handleHealthCheck();
}
