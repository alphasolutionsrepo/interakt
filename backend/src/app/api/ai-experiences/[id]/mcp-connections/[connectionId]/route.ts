import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import { handleUpdateAttachment, handleDetach } from '@/features/mcp-connection/mcp-connection.api.handlers';

export const PATCH = withPermission('ai-experiences:edit', async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; connectionId: string }> },
) {
  return handleUpdateAttachment(request, context);
});

export const DELETE = withPermission('ai-experiences:edit', async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; connectionId: string }> },
) {
  return handleDetach(request, context);
});
