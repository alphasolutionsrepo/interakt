import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import { handleDeleteMemory } from '@/features/user-memories/user-memories.api.handlers';

export const DELETE = withPermission('prompts:edit', async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return handleDeleteMemory(request, context);
});
