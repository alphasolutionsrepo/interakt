// app/api/analytics/search/recent/route.ts

import { NextRequest } from 'next/server';
import { handleGetRecentSearches } from '@/features/analytics/analytics.api.handlers';

export async function GET(request: NextRequest) {
  return handleGetRecentSearches(request);
}
