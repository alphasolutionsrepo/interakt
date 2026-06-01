// app/api/analytics/ai/tools/route.ts

import { NextRequest } from 'next/server';
import { handleGetToolUsage } from '@/features/analytics/analytics.api.handlers';

export async function GET(request: NextRequest) {
  return handleGetToolUsage(request);
}
