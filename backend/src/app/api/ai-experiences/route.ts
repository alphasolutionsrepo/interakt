import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import {
  handleListAIExperiences,
  handleCreateAIExperience,
} from '@/features/ai-experience/ai-experience.api.handlers';

export const GET = withPermission('ai-experiences:view', async function GET(request: NextRequest) {
  return handleListAIExperiences(request);
});

export const POST = withPermission('ai-experiences:edit', async function POST(request: NextRequest) {
  return handleCreateAIExperience(request);
});
