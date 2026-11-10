import { NextRequest } from 'next/server';

import { forBuiltInChange } from '@/features/access/built-in';

import {
  handleUpdateToolAssignment,
  handleRemoveToolAssignment,
} from '@/features/ai-experience/ai-experience.api.handlers';

export const PUT = forBuiltInChange('ai-experience', 'ai-experiences:edit', async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string; toolId: string }> }
) {
  return handleUpdateToolAssignment(request, context);
});

export const DELETE = forBuiltInChange('ai-experience', 'ai-experiences:edit', async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; toolId: string }> }
) {
  return handleRemoveToolAssignment(request, context);
});
