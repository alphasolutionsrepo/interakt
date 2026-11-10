import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import { handleDeleteDocument } from '@/features/knowledge-base/knowledge-base.api.handlers';

export const DELETE = withPermission('prompts:edit', async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return handleDeleteDocument(request, context);
});
