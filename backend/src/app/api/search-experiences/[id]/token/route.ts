// app/api/search-experiences/[id]/token/route.ts

/**
 * Search Experience Access Token API Route
 *
 * POST /api/search-experiences/:id/token - Regenerate access token
 */

import { NextRequest } from 'next/server';
import { handleRegenerateAccessToken } from '@/features/search-experience/search-experience.admin.handlers';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return handleRegenerateAccessToken(request, context);
}
