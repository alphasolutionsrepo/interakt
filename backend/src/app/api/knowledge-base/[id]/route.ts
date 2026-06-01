import { NextRequest } from 'next/server';
import { handleDeleteDocument } from '@/features/knowledge-base/knowledge-base.api.handlers';

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return handleDeleteDocument(request, context);
}
