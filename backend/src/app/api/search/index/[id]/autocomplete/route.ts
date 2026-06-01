// app/api/search/index/[id]/autocomplete/route.ts

/**
 * Autocomplete by Index ID API Route
 * POST /api/search/index/:id/autocomplete - Get autocomplete suggestions
 */

import { NextRequest } from 'next/server';
import { handleAutocompleteById } from '@/features/search/search.api.handlers';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const resolvedParams = await params;
    return handleAutocompleteById(request, resolvedParams);
}
