// app/api/telemetry/config/clear-all/route.ts

import { handleClearAllOverrides } from '@/features/telemetry/telemetry.api.handlers';

export async function POST() {
  return handleClearAllOverrides();
}
