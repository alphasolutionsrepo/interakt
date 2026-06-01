// app/api/users/[id]/activate/route.ts

import { NextRequest } from 'next/server';
import { handleActivateUser } from '@/features/auth/users.api.handlers';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return handleActivateUser(request, id);
}
