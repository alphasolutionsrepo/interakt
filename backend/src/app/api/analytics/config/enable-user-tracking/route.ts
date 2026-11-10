// app/api/analytics/config/enable-user-tracking/route.ts

import { withPermission } from '@/features/access/route-guard';
import { handleEnableUserTracking } from '@/features/analytics/analytics.api.handlers';

export const POST = withPermission('analytics:manage', async function POST() {
  return handleEnableUserTracking();
});
