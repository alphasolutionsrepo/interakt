// app/api/search/name/[name]/autocomplete/route.ts

/**
 * Autocomplete by Index Name API Route
 * POST /api/search/name/:name/autocomplete - Get autocomplete suggestions
 */

import { NextRequest } from 'next/server';
import { handleAutocompleteByName } from '@/features/search/search.api.handlers';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ name: string }> }
) {
    const resolvedParams = await params;
    return handleAutocompleteByName(request, resolvedParams);
}
