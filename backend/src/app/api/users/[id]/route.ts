// app/api/users/[id]/route.ts

import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import {
  handleGetUser,
  handleUpdateUser,
} from '@/features/auth/users.api.handlers';

export const GET = withPermission('signed-in', async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return handleGetUser(request, id);
});

export const PUT = withPermission('signed-in', async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return handleUpdateUser(request, id);
});
