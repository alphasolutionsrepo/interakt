// app/api/ai-service/embeddings/route.ts

/**
 * Embeddings API Route
 * POST /api/ai-service/embeddings - Generate embeddings for texts
 */

import { NextRequest } from 'next/server';
import { handleEmbeddings } from '@/features/ai-service/ai-service.api.handlers';

export async function POST(request: NextRequest) {
  return handleEmbeddings(request);
}