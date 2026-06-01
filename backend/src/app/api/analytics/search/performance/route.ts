// app/api/analytics/search/performance/route.ts

import { NextRequest } from 'next/server';
import { handleGetPerformanceMetrics } from '@/features/analytics/analytics.api.handlers';

export async function GET(request: NextRequest) {
  return handleGetPerformanceMetrics(request);
}
