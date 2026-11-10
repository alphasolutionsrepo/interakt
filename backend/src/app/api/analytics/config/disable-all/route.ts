// app/api/analytics/config/disable-all/route.ts

import { withPermission } from '@/features/access/route-guard';
import { handleDisableAllAnalytics } from '@/features/analytics/analytics.api.handlers';

export const POST = withPermission('analytics:manage', async function POST() {
  return handleDisableAllAnalytics();
});
