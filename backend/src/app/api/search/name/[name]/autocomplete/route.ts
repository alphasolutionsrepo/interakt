// app/api/search/name/[name]/autocomplete/route.ts

/**
 * Autocomplete by Index Name API Route
 * POST /api/search/name/:name/autocomplete - Get autocomplete suggestions
 */

import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import { handleAutocompleteByName } from '@/features/search/search.api.handlers';

export const POST = withPermission('playground:use', async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ name: string }> }
) {
    const resolvedParams = await params;
    return handleAutocompleteByName(request, resolvedParams);
});
