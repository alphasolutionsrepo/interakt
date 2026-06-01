// app/api/search-indexes/[id]/fields/route.ts

/**
 * Search Index Fields API Route
 * GET  /api/search-indexes/:id/fields - Get all fields for a search index
 * POST /api/search-indexes/:id/fields - Create a new custom field
 */

import { NextRequest } from 'next/server';
import {
    handleGetFields,
    handleCreateField,
} from '@/features/search-index/search-index.api.handlers';

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    return handleGetFields(request, context);
}

export async function POST(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    return handleCreateField(request, context);
}
