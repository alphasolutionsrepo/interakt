import { NextRequest } from 'next/server';

import { forExperienceChange } from '@/features/access/built-in-experiences';
import { withPermission } from '@/features/access/route-guard';
import {
  handleListExperienceOverrides,
  handleSetExperienceOverride,
} from '@/features/prompt-templates/prompt-template.api.handlers';

export const GET = withPermission('ai-experiences:view', async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return handleListExperienceOverrides(request, context);
});

export const PUT = forExperienceChange('ai', async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return handleSetExperienceOverride(request, context);
});
