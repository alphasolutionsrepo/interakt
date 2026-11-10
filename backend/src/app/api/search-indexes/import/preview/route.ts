/**
 * Preview Import Search Index API Route
 * POST /api/search-indexes/import/preview - Preview search index import
 */

import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import { handlePreviewImport } from '@/features/search-index/search-index.api.handlers';

export const POST = withPermission('search-indexes:view', async function POST(request: NextRequest) {
    return handlePreviewImport(request);
});
