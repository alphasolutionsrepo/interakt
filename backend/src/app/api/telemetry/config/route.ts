// app/api/telemetry/config/route.ts

import { withPermission } from '@/features/access/route-guard';
import { handleGetTelemetryConfig } from '@/features/telemetry/telemetry.api.handlers';

export const GET = withPermission('analytics:view', async function GET() {
  return handleGetTelemetryConfig();
});
