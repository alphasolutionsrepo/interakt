// app/api/ai-service/text/route.ts

/**
 * Text Generation API Route
 * POST /api/ai-service/text - Generate text from prompt
 */

import { NextRequest } from 'next/server';
import { handleTextGeneration } from '@/features/ai-service/ai-service.api.handlers';

export async function POST(request: NextRequest) {
  return handleTextGeneration(request);
}