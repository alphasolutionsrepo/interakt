// app/api/health/elasticsearch/route.ts

import { NextRequest } from 'next/server';
import { handleGetElasticsearchHealth } from '@/features/health/health.api.handlers';

export async function GET(request: NextRequest) {
  return handleGetElasticsearchHealth(request);
}
