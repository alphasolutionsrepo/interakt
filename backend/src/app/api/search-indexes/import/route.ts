/**
 * Import Search Index API Route
 * POST /api/search-indexes/import - Import search index from JSON
 */

import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import { handleImportSearchIndex } from '@/features/search-index/search-index.api.handlers';

export const POST = withPermission('search-indexes:edit', async function POST(request: NextRequest) {
    return handleImportSearchIndex(request);
});
