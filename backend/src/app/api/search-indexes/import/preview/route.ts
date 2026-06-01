/**
 * Preview Import Search Index API Route
 * POST /api/search-indexes/import/preview - Preview search index import
 */

import { NextRequest } from 'next/server';
import { handlePreviewImport } from '@/features/search-index/search-index.api.handlers';

export async function POST(request: NextRequest) {
    return handlePreviewImport(request);
}
