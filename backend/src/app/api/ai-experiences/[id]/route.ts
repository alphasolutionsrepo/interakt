import { NextRequest } from 'next/server';

import { forBuiltInChange } from '@/features/access/built-in';
import { forExperienceRows } from '@/features/access/picker-reads';
import { withPermission } from '@/features/access/route-guard';
import {
  handleGetAIExperience,
  handleUpdateAIExperience,
  handleDeleteAIExperience,
} from '@/features/ai-experience/ai-experience.api.handlers';

export const GET = withPermission('ai-experiences:view', forExperienceRows(async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return handleGetAIExperience(request, context);
}));

export const PUT = forBuiltInChange('ai-experience', 'ai-experiences:edit', forExperienceRows(async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return handleUpdateAIExperience(request, context);
}));

export const DELETE = forBuiltInChange('ai-experience', 'ai-experiences:edit', async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return handleDeleteAIExperience(request, context);
});
