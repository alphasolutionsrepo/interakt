// app/api/search-indexes/[id]/documents/[documentId]/route.ts

/**
 * Single Document API Routes
 * GET    /api/search-indexes/:id/documents/:documentId - Get an indexed document
 * PUT    /api/search-indexes/:id/documents/:documentId - Replace a document in full
 * PATCH  /api/search-indexes/:id/documents/:documentId - Partially update a document
 * DELETE /api/search-indexes/:id/documents/:documentId - Delete a document
 *
 * The documentId is the value of the index's mapped uniqueId field (often a
 * source-system id such as a SKU), not a UUID.
 */

import { NextRequest } from 'next/server';

import { forBuiltInDocumentChange } from '@/features/access/built-in';
import { withPermissionOrIngestionKey } from '@/features/access/route-guard';
import {
    handleGetDocument,
    handleReplaceDocument,
    handleMergeDocument,
    handleDeleteDocument,
} from '@/features/document-indexing';
import { ingestionRateLimitKey } from '@/features/ingestion-keys';
import { withRateLimit } from '@/shared/api/rate-limit';

export const dynamic = 'force-dynamic';

type DocumentContext = { params: Promise<{ id: string; documentId: string }> };

/**
 * Single-document writes are cheap individually but a sync loop can issue many,
 * so the ceiling here is higher than the bulk routes'.
 */
const singleDocumentRateLimit = {
    maxRequests: 300,
    windowMs: 60_000,
    keyFn: ingestionRateLimitKey,
};

export const GET = withPermissionOrIngestionKey('search-indexes:view', async function GET(request: NextRequest, context: DocumentContext) {
    return handleGetDocument(request, context);
});

export const PUT = forBuiltInDocumentChange('documents:edit', withRateLimit(
    async (request: NextRequest, context: DocumentContext) =>
        handleReplaceDocument(request, context),
    singleDocumentRateLimit
));

export const PATCH = forBuiltInDocumentChange('documents:edit', withRateLimit(
    async (request: NextRequest, context: DocumentContext) =>
        handleMergeDocument(request, context),
    singleDocumentRateLimit
));

export const DELETE = forBuiltInDocumentChange('documents:edit', withRateLimit(
    async (request: NextRequest, context: DocumentContext) =>
        handleDeleteDocument(request, context),
    singleDocumentRateLimit
));
