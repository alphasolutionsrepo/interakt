/**
 * Import Search Index API Route
 * POST /api/search-indexes/import - Import search index from JSON
 */

import { NextRequest } from 'next/server';
import { handleImportSearchIndex } from '@/features/search-index/search-index.api.handlers';

export async function POST(request: NextRequest) {
    return handleImportSearchIndex(request);
}
