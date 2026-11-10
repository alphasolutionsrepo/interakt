import { NextRequest } from 'next/server';

import { forExperienceChange } from '@/features/access/built-in-experiences';
import {
  handleUpdateToolAssignment,
  handleRemoveToolAssignment,
} from '@/features/ai-experience/ai-experience.api.handlers';

export const PUT = forExperienceChange('ai', async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string; toolId: string }> }
) {
  return handleUpdateToolAssignment(request, context);
});

export const DELETE = forExperienceChange('ai', async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; toolId: string }> }
) {
  return handleRemoveToolAssignment(request, context);
});
