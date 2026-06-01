// app/api/telemetry/config/experience/route.ts

import { handleSetExperienceOverride } from '@/features/telemetry/telemetry.api.handlers';
import type { NextRequest } from 'next/server';

export async function PUT(request: NextRequest) {
  return handleSetExperienceOverride(request);
}
