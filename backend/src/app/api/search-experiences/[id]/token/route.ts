// app/api/search-experiences/[id]/token/route.ts

/**
 * Search Experience Access Token API Route
 *
 * POST /api/search-experiences/:id/token - Regenerate access token
 */

import { NextRequest } from 'next/server';

import { forExperienceChange } from '@/features/access/built-in-experiences';
import { handleRegenerateAccessToken } from '@/features/search-experience/search-experience.admin.handlers';

export const POST = forExperienceChange('search', async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return handleRegenerateAccessToken(request, context);
});
