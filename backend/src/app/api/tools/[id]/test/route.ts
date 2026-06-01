// app/api/tools/[id]/test/route.ts

/**
 * Tool Test Endpoint
 * POST /api/tools/:id/test
 *
 * Executes a tool with the provided input and returns the raw result.
 * Used by the test panel in the dashboard to verify tool configuration.
 */

import { NextRequest } from 'next/server';
import { handleTestTool } from '@/features/tools/tools.api.handlers';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return handleTestTool(request, context);
}
