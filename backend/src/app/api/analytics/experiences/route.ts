// app/api/analytics/experiences/route.ts

/** GET /api/analytics/experiences - the experiences analytics can be scoped to (names only) */

import { withPermission } from '@/features/access/route-guard';
import { listAnalyticsExperiences } from '@/features/analytics/analytics-experiences.service';
import { apiResponse } from '@/shared/api/response';

export const GET = withPermission('analytics:view', async function GET() {
  try {
    return apiResponse.success(await listAnalyticsExperiences());
  } catch (error) {
    return apiResponse.error(error, 500, { operation: 'listAnalyticsExperiences' });
  }
});
