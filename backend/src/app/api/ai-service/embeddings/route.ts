// app/api/ai-service/embeddings/route.ts

/**
 * Embeddings API Route
 * POST /api/ai-service/embeddings - Generate embeddings for texts
 */

import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import { handleEmbeddings } from '@/features/ai-service/ai-service.api.handlers';

export const POST = withPermission('playground:use', async function POST(request: NextRequest) {
  return handleEmbeddings(request);
});