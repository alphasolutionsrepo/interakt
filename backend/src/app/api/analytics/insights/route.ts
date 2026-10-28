// app/api/analytics/insights/route.ts

import { NextRequest } from 'next/server';

import { handleGetInsights } from '@/features/analytics/analytics.api.handlers';

export async function GET(request: NextRequest) {
  return handleGetInsights(request);
}
