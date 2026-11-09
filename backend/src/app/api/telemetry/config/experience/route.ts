// app/api/telemetry/config/experience/route.ts

import type { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import { handleSetExperienceOverride } from '@/features/telemetry/telemetry.api.handlers';

export const PUT = withPermission('analytics:manage', async function PUT(request: NextRequest) {
  return handleSetExperienceOverride(request);
});
