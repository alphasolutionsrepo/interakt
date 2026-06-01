// app/api/search-experiences/check-slug/route.ts

/**
 * Search Experience Slug Check API Route
 *
 * GET /api/search-experiences/check-slug?slug=xxx&excludeId=xxx
 */

import { NextRequest } from 'next/server';
import { handleCheckSlug } from '@/features/search-experience/search-experience.admin.handlers';

export async function GET(request: NextRequest) {
  return handleCheckSlug(request);
}
