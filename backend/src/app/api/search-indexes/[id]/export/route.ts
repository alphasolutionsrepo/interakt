/**
 * Export Search Index API Route
 * GET /api/search-indexes/:id/export - Export search index as JSON
 */

import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import { handleExportSearchIndex } from '@/features/search-index/search-index.api.handlers';

export const GET = withPermission('search-indexes:view', async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const params = await context.params;
    return handleExportSearchIndex(request, { params });
});
