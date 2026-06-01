// app/api/analytics/config/disable-user-tracking/route.ts

import { handleDisableUserTracking } from '@/features/analytics/analytics.api.handlers';

export async function POST() {
  return handleDisableUserTracking();
}
