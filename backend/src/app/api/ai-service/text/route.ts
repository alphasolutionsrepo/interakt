// app/api/ai-service/text/route.ts

/**
 * Text Generation API Route
 * POST /api/ai-service/text - Generate text from prompt
 */

import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import { handleTextGeneration } from '@/features/ai-service/ai-service.api.handlers';

export const POST = withPermission('playground:use', async function POST(request: NextRequest) {
  return handleTextGeneration(request);
});