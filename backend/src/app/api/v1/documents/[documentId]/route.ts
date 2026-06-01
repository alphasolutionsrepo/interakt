// app/api/v1/documents/[documentId]/route.ts

/**
 * Get Document by ID API Route
 *
 * Fetch a single document from a Search Experience.
 * Authentication is via access token (same as search API).
 * Respects field configurations (includeInResponse) from the index.
 *
 * GET /api/v1/documents/:documentId
 */

import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/shared/logger/logger';
import { authenticateAccessToken, createCorsHeaders, handleCorsPreflight, type MiddlewareError } from '@/features/search-experience/access-token.middleware';
import * as searchService from '@/features/search/search.service';
import { SearchError } from '@/features/search/search.types';

const logger = createLogger('document-api');

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  const { documentId } = await params;

  try {
    // 1. Authenticate via access token (gets experience)
    const authResult = await authenticateAccessToken(request, {
      validateOrigin: true,
      checkRateLimit: true,
    });

    if (!authResult.success) {
      return (authResult as MiddlewareError).response;
    }

    const experience = authResult.experience;

    // 2. Get active indexes
    const activeIndexes = experience.indexes.filter((idx) => idx.searchIndex.isActive);

    if (activeIndexes.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No active indexes configured', code: 'NO_INDEXES' },
        { status: 400 }
      );
    }

    // 3. Try to find document in each index
    let document: searchService.GetDocumentResponse | null = null;

    for (const idx of activeIndexes) {
      try {
        document = await searchService.getDocumentByIdFromIndex(
          idx.searchIndexId,
          documentId
        );
        if (document) {
          break;
        }
      } catch (err) {
        // Continue to next index if this one fails
        logger.debug('Document not found in index', {
          indexId: idx.searchIndexId,
          documentId,
        });
      }
    }

    if (!document) {
      return NextResponse.json(
        { success: false, error: 'Document not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    // 4. Return document with display config
    const response = {
      document: {
        id: document.id,
        fields: document.fields,
        indexId: document.indexId,
        indexName: document.indexName,
      },
      displayConfig: experience.displayConfig || undefined,
    };

    logger.info('Document fetched', {
      experienceId: experience.id,
      documentId,
      indexId: document.indexId,
    });

    // Add CORS headers
    const origin = request.headers.get('origin');
    const corsHeaders = createCorsHeaders(experience, origin);

    const jsonResponse = NextResponse.json({ success: true, data: response });
    corsHeaders.forEach((value, key) => {
      jsonResponse.headers.set(key, value);
    });

    return jsonResponse;
  } catch (error) {
    logger.error('Failed to fetch document', {
      documentId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    if (error instanceof SearchError) {
      const statusMap: Record<string, number> = {
        INDEX_NOT_FOUND: 404,
        INDEX_NOT_READY: 503,
        PROVIDER_ERROR: 503,
      };
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: statusMap[error.code] ?? 500 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return handleCorsPreflight();
}
