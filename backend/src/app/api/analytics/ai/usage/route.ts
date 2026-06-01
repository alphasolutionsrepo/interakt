// app/api/analytics/ai/usage/route.ts

import { NextRequest } from 'next/server';
import { handleGetAIUsage } from '@/features/analytics/analytics.api.handlers';

export async function GET(request: NextRequest) {
  return handleGetAIUsage(request);
}
