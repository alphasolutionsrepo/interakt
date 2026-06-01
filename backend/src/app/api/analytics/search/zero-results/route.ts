// app/api/analytics/search/zero-results/route.ts

import { NextRequest } from 'next/server';
import { handleGetZeroResultQueries } from '@/features/analytics/analytics.api.handlers';

export async function GET(request: NextRequest) {
  return handleGetZeroResultQueries(request);
}
