import { NextRequest } from 'next/server';

import { forBuiltInChange } from '@/features/access/built-in';
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

export const PUT = forBuiltInChange('ai-experience', 'ai-experiences:edit', async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return handleSetExperienceOverride(request, context);
});
