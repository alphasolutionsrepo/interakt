// app/api/analytics/config/experience/route.ts

import { handleSetExperienceOverride } from '@/features/analytics/analytics.api.handlers';
import type { NextRequest } from 'next/server';

export async function PUT(request: NextRequest) {
  return handleSetExperienceOverride(request);
}
