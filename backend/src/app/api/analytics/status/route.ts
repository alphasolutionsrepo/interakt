// app/api/analytics/status/route.ts

import { withPermission } from '@/features/access/route-guard';
import { handleGetStatus } from '@/features/analytics/analytics.api.handlers';

export const GET = withPermission('analytics:view', async function GET() {
  return handleGetStatus();
});
