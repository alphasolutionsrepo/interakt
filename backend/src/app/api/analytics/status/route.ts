// app/api/analytics/status/route.ts

import { handleGetStatus } from '@/features/analytics/analytics.api.handlers';

export async function GET() {
  return handleGetStatus();
}
