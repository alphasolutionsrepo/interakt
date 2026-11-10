// app/api/users/[id]/change-password/route.ts

import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import { handleChangePassword } from '@/features/auth/users.api.handlers';

export const POST = withPermission('signed-in', async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return handleChangePassword(request, id);
});
