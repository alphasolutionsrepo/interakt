// app/api/telemetry/config/route.ts

import { handleGetTelemetryConfig } from '@/features/telemetry/telemetry.api.handlers';

export async function GET() {
  return handleGetTelemetryConfig();
}
