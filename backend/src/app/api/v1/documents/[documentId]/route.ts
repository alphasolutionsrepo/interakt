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

import { apiResponse } from '@/shared/api/response';
import { createLogger } from '@/shared/logger/logger';
import { authenticateAccessToken, handleCorsPreflight, withCors, type MiddlewareError } from '@/features/search-experience/access-token.middleware';
import type { SearchExperienceWithIndexes } from '@/features/search-experience/search-experience.types';
import { AppError } from '@/shared/errors/app-error';
import * as searchService from '@/features/search/search.service';
import { publicRoute } from '@/shared/api/public-route';

const logger = createLogger('document-api');

async function get(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  const { documentId } = await params;
  const origin = request.headers.get('origin');
  // Known once the token is checked: a failure after that is answered with its CORS
  // headers, or the visitor's browser hides it
  let experience: SearchExperienceWithIndexes | undefined;

  try {
    // 1. Authenticate via access token (gets experience)
    const authResult = await authenticateAccessToken(request);

    if (!authResult.success) {
      return (authResult as MiddlewareError).response;
    }

    experience = authResult.experience;
    // A const for the callbacks below
    const exp = experience;

    // 2. Get active indexes
    const activeIndexes = experience.indexes.filter((idx) => idx.searchIndex.isActive);

    if (activeIndexes.length === 0) {
      return withCors(apiResponse.error(new AppError('No active indexes configured', { code: 'NO_INDEXES', status: 400 }), undefined, { operation: 'getPublicDocument', experienceId: experience.id, documentId }), experience, origin);
    }

    // 3. Try to find document in each index
    let document: searchService.GetDocumentResponse | null = null;
    // Lookups that failed rather than not finding the document
    const failures: Array<{ indexId: string; error: unknown }> = [];

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
        failures.push({ indexId: idx.searchIndexId, error: err });
      }
    }

    const logFailure = (failure: (typeof failures)[number], message: string) =>
      logger.warn(message, { experienceId: exp.id, documentId, indexId: failure.indexId, err: failure.error });

    // A lookup failed and no other index had it: it may be in the one that failed, so
    // the answer is the failure, not "not found". The answer's failure is logged by
    // apiResponse; the others are logged here, or nothing would say why they failed.
    if (!document && failures.length > 0) {
      const [first, ...others] = failures;
      for (const failure of others) logFailure(failure, 'A document lookup failed too');
      return withCors(apiResponse.error(first.error, undefined, { operation: 'getPublicDocument', experienceId: experience.id, documentId, indexId: first.indexId }), experience, origin);
    }
    for (const failure of failures) logFailure(failure, 'A document lookup failed; another index had the document');

    if (!document) {
      return withCors(apiResponse.notFound('Document not found'), experience, origin);
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

    return withCors(NextResponse.json({ success: true, data: response }), experience, origin);
  } catch (error) {
    // A search error answers with its own status; a server failure gets the plain
    // public message and a request id. Logged once by apiResponse.
    const answer = apiResponse.error(error, undefined, { operation: 'getPublicDocument', documentId });
    return experience ? withCors(answer, experience, origin) : answer;
  }
}

export async function OPTIONS() {
  return handleCorsPreflight();
}

export const GET = publicRoute(get);
