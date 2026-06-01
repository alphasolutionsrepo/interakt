// app/api/analytics/dashboard/route.ts

import { NextRequest } from 'next/server';
import { handleGetDashboard } from '@/features/analytics/analytics.api.handlers';

export async function GET(request: NextRequest) {
  return handleGetDashboard(request);
}
