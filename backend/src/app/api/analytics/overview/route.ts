// app/api/analytics/overview/route.ts

import { NextRequest } from 'next/server';
import { handleGetOverview } from '@/features/analytics/analytics.api.handlers';

export async function GET(request: NextRequest) {
  return handleGetOverview(request);
}
