// app/api/health/ai-providers/route.ts

import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import { handleGetAIProvidersHealth } from '@/features/health/health.api.handlers';

export const GET = withPermission('signed-in', async function GET(request: NextRequest) {
  return handleGetAIProvidersHealth(request);
});
