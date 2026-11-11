import { NextRequest } from 'next/server';

import { checksBuiltInInHandler } from '@/features/access/built-in';
import { withPermission } from '@/features/access/route-guard';
import { handleDeleteDocument } from '@/features/knowledge-base/knowledge-base.api.handlers';

// From the docs data source: handleDeleteDocument refuses a non-Admin
export const DELETE = checksBuiltInInHandler(withPermission('prompts:edit', async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return handleDeleteDocument(request, context);
}));
