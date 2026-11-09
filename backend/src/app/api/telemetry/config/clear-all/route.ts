// app/api/telemetry/config/clear-all/route.ts

import { withPermission } from '@/features/access/route-guard';
import { handleClearAllOverrides } from '@/features/telemetry/telemetry.api.handlers';

export const POST = withPermission('analytics:manage', async function POST() {
  return handleClearAllOverrides();
});
