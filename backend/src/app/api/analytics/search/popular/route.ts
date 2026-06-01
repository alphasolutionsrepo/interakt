// app/api/analytics/search/popular/route.ts

import { NextRequest } from 'next/server';
import { handleGetPopularQueries } from '@/features/analytics/analytics.api.handlers';

export async function GET(request: NextRequest) {
  return handleGetPopularQueries(request);
}
