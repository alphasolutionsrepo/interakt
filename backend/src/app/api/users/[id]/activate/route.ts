// app/api/users/[id]/activate/route.ts

import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import { handleActivateUser } from '@/features/auth/users.api.handlers';

export const PATCH = withPermission('users:manage', async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return handleActivateUser(request, id);
});
