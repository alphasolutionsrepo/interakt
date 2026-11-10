// app/api/analytics/config/disable-user-tracking/route.ts

import { withPermission } from '@/features/access/route-guard';
import { handleDisableUserTracking } from '@/features/analytics/analytics.api.handlers';

export const POST = withPermission('analytics:manage', async function POST() {
  return handleDisableUserTracking();
});
