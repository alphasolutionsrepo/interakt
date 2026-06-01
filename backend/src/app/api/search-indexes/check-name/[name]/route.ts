// app/api/search-indexes/check-name/[name]/route.ts

/**
 * Check Index Name Availability API Route
 * GET /api/search-indexes/check-name/:name - Check if name is available
 */

import { NextRequest } from 'next/server';
import { handleCheckNameAvailability } from '@/features/search-index/search-index.api.handlers';

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ name: string }> }
) {
    return handleCheckNameAvailability(request, context);
}