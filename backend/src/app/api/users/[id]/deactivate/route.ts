// app/api/users/[id]/deactivate/route.ts

import { NextRequest } from 'next/server';
import { handleDeactivateUser } from '@/features/auth/users.api.handlers';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return handleDeactivateUser(request, id);
}
