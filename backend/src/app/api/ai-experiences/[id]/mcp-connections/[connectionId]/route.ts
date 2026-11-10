import { NextRequest } from 'next/server';

import { forBuiltInChange } from '@/features/access/built-in';

import { handleUpdateAttachment, handleDetach } from '@/features/mcp-connection/mcp-connection.api.handlers';

export const PATCH = forBuiltInChange('ai-experience', 'ai-experiences:edit', async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; connectionId: string }> },
) {
  return handleUpdateAttachment(request, context);
});

export const DELETE = forBuiltInChange('ai-experience', 'ai-experiences:edit', async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; connectionId: string }> },
) {
  return handleDetach(request, context);
});
