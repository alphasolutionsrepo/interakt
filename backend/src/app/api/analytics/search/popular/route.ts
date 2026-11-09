// app/api/analytics/search/popular/route.ts

import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import { handleGetPopularQueries } from '@/features/analytics/analytics.api.handlers';

export const GET = withPermission('analytics:view', async function GET(request: NextRequest) {
  return handleGetPopularQueries(request);
});
