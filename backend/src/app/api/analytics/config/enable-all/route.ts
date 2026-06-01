// app/api/analytics/config/enable-all/route.ts

import { handleEnableAllAnalytics } from '@/features/analytics/analytics.api.handlers';

export async function POST() {
  return handleEnableAllAnalytics();
}
