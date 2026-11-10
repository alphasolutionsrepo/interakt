import { NextRequest } from 'next/server';

import { forExperienceChange } from '@/features/access/built-in-experiences';
import { withPermission } from '@/features/access/route-guard';
import {
  handleGetAIExperience,
  handleUpdateAIExperience,
  handleDeleteAIExperience,
} from '@/features/ai-experience/ai-experience.api.handlers';

export const GET = withPermission('ai-experiences:view', async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return handleGetAIExperience(request, context);
});

export const PUT = forExperienceChange('ai', async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return handleUpdateAIExperience(request, context);
});

export const DELETE = forExperienceChange('ai', async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return handleDeleteAIExperience(request, context);
});
