// app/api/search-indexes/[id]/fields/[fieldId]/route.ts

/**
 * Single Search Index Field API Route
 * PUT    /api/search-indexes/:id/fields/:fieldId - Update a single field
 * DELETE /api/search-indexes/:id/fields/:fieldId - Delete a custom field
 */

import { NextRequest } from 'next/server';

import { forBuiltInChange } from '@/features/access/built-in';
import {
    handleUpdateField,
    handleDeleteField,
} from '@/features/search-index/search-index.api.handlers';

export const PUT = forBuiltInChange('search-index', 'search-indexes:edit', async function PUT(
    request: NextRequest,
    context: { params: Promise<{ id: string; fieldId: string }> }
) {
    return handleUpdateField(request, context);
});

export const DELETE = forBuiltInChange('search-index', 'search-indexes:edit', async function DELETE(
    request: NextRequest,
    context: { params: Promise<{ id: string; fieldId: string }> }
) {
    return handleDeleteField(request, context);
});