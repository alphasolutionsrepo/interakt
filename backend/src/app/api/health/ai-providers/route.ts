// app/api/health/ai-providers/route.ts

import { NextRequest } from 'next/server';
import { handleGetAIProvidersHealth } from '@/features/health/health.api.handlers';

export async function GET(request: NextRequest) {
  return handleGetAIProvidersHealth(request);
}
