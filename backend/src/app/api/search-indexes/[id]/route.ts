// app/api/search-indexes/[id]/route.ts

/**
 * Single Search Index API Routes
 * GET    /api/search-indexes/:id - Get search index by ID
 * PUT    /api/search-indexes/:id - Update search index
 * DELETE /api/search-indexes/:id - Delete search index
 */

import { NextRequest } from 'next/server';
import {
    handleGetSearchIndex,  // Changed from handleGetSearchIndexById
    handleUpdateSearchIndex,
    handleDeleteSearchIndex,
} from '@/features/search-index/search-index.api.handlers';

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    return handleGetSearchIndex(request, context);  // Changed
}

export async function PUT(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    return handleUpdateSearchIndex(request, context);
}

export async function DELETE(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    return handleDeleteSearchIndex(request, context);
}