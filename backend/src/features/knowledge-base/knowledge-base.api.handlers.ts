// src/features/knowledge-base/knowledge-base.api.handlers.ts

/**
 * Knowledge Base API Handlers — Domain Knowledge Base (Sprint 6 / Phase E)
 *
 * Endpoints:
 *   POST   /api/knowledge-base/upload              — upload document text
 *   GET    /api/knowledge-base?dataSourceId=        — list documents
 *   DELETE /api/knowledge-base/:id                  — delete a document + its chunks
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiResponse } from '@/shared/api/response';
import { createLogger } from '@/shared/logger/logger';
import { getCurrentUserId } from '@/shared/utils/auth-utils';
import * as service from './knowledge-base.service';
import type { UploadDocumentInput } from './knowledge-base.service';
import * as repository from './knowledge-base.repository';

const logger = createLogger('knowledge-base-handlers');

// ============================================================================
// UPLOAD — POST /api/knowledge-base/upload
// ============================================================================

const uploadSchema = z.object({
  dataSourceId: z.string().uuid('dataSourceId must be a valid UUID'),
  name: z.string().min(1).max(500),
  content: z.string().min(1, 'Document content cannot be empty'),
  mimeType: z.string().optional(),
});

export async function handleUploadDocument(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return apiResponse.unauthorized();

    const body = await request.json();
    const validation = uploadSchema.safeParse(body);
    if (!validation.success) return apiResponse.validationError(validation.error);

    const result = await service.uploadDocument(validation.data as UploadDocumentInput);

    logger.info('Document uploaded', {
      documentId: result.document.id,
      dataSourceId: validation.data.dataSourceId,
      uploadedBy: userId,
      chunks: result.chunkCount,
      embedded: result.embeddedCount,
    });

    return apiResponse.success({
      document: result.document,
      chunkCount: result.chunkCount,
      embeddedCount: result.embeddedCount,
    }, 201);
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to upload document', err);
    return apiResponse.error(err);
  }
}

// ============================================================================
// LIST — GET /api/knowledge-base?dataSourceId=
// ============================================================================

const listQuerySchema = z.object({
  dataSourceId: z.string().uuid('dataSourceId must be a valid UUID'),
});

export async function handleListDocuments(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return apiResponse.unauthorized();

    const params = Object.fromEntries(request.nextUrl.searchParams);
    const validation = listQuerySchema.safeParse(params);
    if (!validation.success) return apiResponse.validationError(validation.error);

    const documents = await service.listDocuments(validation.data.dataSourceId);
    return apiResponse.success({ documents, total: documents.length });
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to list documents', err);
    return apiResponse.error(err);
  }
}

// ============================================================================
// DELETE — DELETE /api/knowledge-base/:id
// ============================================================================

export async function handleDeleteDocument(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return apiResponse.unauthorized();

    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) {
      return apiResponse.badRequest('Invalid document ID');
    }

    const doc = await repository.getDocumentById(id);
    if (!doc) return apiResponse.notFound('Document not found');

    await service.deleteDocument(id);

    logger.info('Document deleted', { documentId: id, deletedBy: userId });
    return apiResponse.success({ deleted: true });
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to delete document', err);
    return apiResponse.error(err);
  }
}
