// app/api/search-experiences/route.ts

/**
 * Search Experiences API Route
 *
 * GET  /api/search-experiences - List search experiences
 * POST /api/search-experiences - Create a new search experience
 */

import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import {
  handleListSearchExperiences,
  handleCreateSearchExperience,
} from '@/features/search-experience/search-experience.admin.handlers';

export const GET = withPermission('search-experiences:view', async function GET(request: NextRequest) {
  return handleListSearchExperiences(request);
});

export const POST = withPermission('search-experiences:edit', async function POST(request: NextRequest) {
  return handleCreateSearchExperience(request);
});
