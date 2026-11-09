import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import { handleListMemories, handleDeleteAllMemories } from '@/features/user-memories/user-memories.api.handlers';

export const GET = withPermission('prompts:view', async function GET(request: NextRequest) {
  return handleListMemories(request);
});

export const DELETE = withPermission('prompts:edit', async function DELETE(request: NextRequest) {
  return handleDeleteAllMemories(request);
});
