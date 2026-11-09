// app/api/health/elasticsearch/route.ts

import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import { handleGetElasticsearchHealth } from '@/features/health/health.api.handlers';

export const GET = withPermission('signed-in', async function GET(request: NextRequest) {
  return handleGetElasticsearchHealth(request);
});
