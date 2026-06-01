import { NextRequest } from 'next/server';
import { handleUpdateAttachment, handleDetach } from '@/features/mcp-connection/mcp-connection.api.handlers';

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; connectionId: string }> },
) {
  return handleUpdateAttachment(request, context);
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; connectionId: string }> },
) {
  return handleDetach(request, context);
}
