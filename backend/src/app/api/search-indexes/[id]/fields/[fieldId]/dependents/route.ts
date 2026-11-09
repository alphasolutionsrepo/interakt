// app/api/search-indexes/[id]/fields/[fieldId]/dependents/route.ts

/**
 * Field Dependents API Route
 * GET /api/search-indexes/:id/fields/:fieldId/dependents
 *
 * Lists what would break if this field were deleted, so the UI can warn before
 * asking for confirmation. DELETE on the field re-checks this server-side and
 * returns 409 — this endpoint is a convenience, not the guard.
 */

import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import { handleGetFieldDependents } from '@/features/search-index/search-index.api.handlers';

export const GET = withPermission('search-indexes:view', async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string; fieldId: string }> }
) {
    return handleGetFieldDependents(request, context);
});
