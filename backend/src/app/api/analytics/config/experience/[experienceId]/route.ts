// app/api/analytics/config/experience/[experienceId]/route.ts

import { handleClearExperienceOverride } from '@/features/analytics/analytics.api.handlers';
import type { NextRequest } from 'next/server';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ experienceId: string }> }
) {
  const { experienceId } = await params;
  return handleClearExperienceOverride(request, experienceId);
}
