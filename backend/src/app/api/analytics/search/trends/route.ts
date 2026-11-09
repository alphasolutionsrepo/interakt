// app/api/analytics/search/trends/route.ts

import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import { handleGetSearchTrends } from '@/features/analytics/analytics.api.handlers';

export const GET = withPermission('analytics:view', async function GET(request: NextRequest) {
  return handleGetSearchTrends(request);
});
