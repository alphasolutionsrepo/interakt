// app/api/analytics/insights/route.ts

import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import { handleGetInsights } from '@/features/analytics/analytics.api.handlers';

export const GET = withPermission('analytics:view', async function GET(request: NextRequest) {
  return handleGetInsights(request);
});
