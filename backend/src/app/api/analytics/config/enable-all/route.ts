// app/api/analytics/config/enable-all/route.ts

import { withPermission } from '@/features/access/route-guard';
import { handleEnableAllAnalytics } from '@/features/analytics/analytics.api.handlers';

export const POST = withPermission('analytics:manage', async function POST() {
  return handleEnableAllAnalytics();
});
