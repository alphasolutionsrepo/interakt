// app/api/analytics/config/enable-user-tracking/route.ts

import { handleEnableUserTracking } from '@/features/analytics/analytics.api.handlers';

export async function POST() {
  return handleEnableUserTracking();
}
