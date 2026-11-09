import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import {
  handleUpdateToolAssignment,
  handleRemoveToolAssignment,
} from '@/features/ai-experience/ai-experience.api.handlers';

export const PUT = withPermission('ai-experiences:edit', async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string; toolId: string }> }
) {
  return handleUpdateToolAssignment(request, context);
});

export const DELETE = withPermission('ai-experiences:edit', async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; toolId: string }> }
) {
  return handleRemoveToolAssignment(request, context);
});
