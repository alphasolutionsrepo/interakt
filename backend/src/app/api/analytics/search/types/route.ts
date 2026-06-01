// app/api/analytics/search/types/route.ts

import { NextRequest } from 'next/server';
import { handleGetSearchTypeBreakdown } from '@/features/analytics/analytics.api.handlers';

export async function GET(request: NextRequest) {
  return handleGetSearchTypeBreakdown(request);
}
