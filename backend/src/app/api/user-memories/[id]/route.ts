import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import { handleDeleteMemory } from '@/features/user-memories/user-memories.api.handlers';

export const DELETE = withPermission('analytics:manage', async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return handleDeleteMemory(request, context);
});
