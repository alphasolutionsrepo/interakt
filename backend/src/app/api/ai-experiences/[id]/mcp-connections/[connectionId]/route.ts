import { NextRequest } from 'next/server';

import { forExperienceChange } from '@/features/access/built-in-experiences';
import { handleUpdateAttachment, handleDetach } from '@/features/mcp-connection/mcp-connection.api.handlers';

export const PATCH = forExperienceChange('ai', async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; connectionId: string }> },
) {
  return handleUpdateAttachment(request, context);
});

export const DELETE = forExperienceChange('ai', async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; connectionId: string }> },
) {
  return handleDetach(request, context);
});
