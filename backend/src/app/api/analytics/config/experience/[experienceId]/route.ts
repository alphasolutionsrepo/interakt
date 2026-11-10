// app/api/analytics/config/experience/[experienceId]/route.ts

import type { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import { handleClearExperienceOverride } from '@/features/analytics/analytics.api.handlers';

export const DELETE = withPermission('analytics:manage', async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ experienceId: string }> }
) {
  const { experienceId } = await params;
  return handleClearExperienceOverride(request, experienceId);
});
