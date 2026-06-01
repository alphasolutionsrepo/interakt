// app/api/analytics/config/disable-all/route.ts

import { handleDisableAllAnalytics } from '@/features/analytics/analytics.api.handlers';

export async function POST() {
  return handleDisableAllAnalytics();
}
