// app/api/search-indexes/[id]/ingestion-keys/[keyId]/route.ts

/**
 * Single Ingestion Key API Route
 * DELETE /api/search-indexes/:id/ingestion-keys/:keyId - Revoke a key
 *
 * Session-only, like the collection route.
 */

import { NextRequest } from 'next/server';

import { forBuiltInChange } from '@/features/access/built-in';
import { handleRevokeIngestionKey } from '@/features/ingestion-keys/ingestion-key.api.handlers';

export const DELETE = forBuiltInChange('search-index', 'secrets:manage', async function DELETE(
    request: NextRequest,
    context: { params: Promise<{ id: string; keyId: string }> }
) {
    return handleRevokeIngestionKey(request, context);
});
