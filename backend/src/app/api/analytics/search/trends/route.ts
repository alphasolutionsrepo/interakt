// app/api/analytics/search/trends/route.ts

import { NextRequest } from 'next/server';
import { handleGetSearchTrends } from '@/features/analytics/analytics.api.handlers';

export async function GET(request: NextRequest) {
  return handleGetSearchTrends(request);
}
