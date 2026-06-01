// app/api/users/[id]/route.ts

import { NextRequest } from 'next/server';
import {
  handleGetUser,
  handleUpdateUser,
} from '@/features/auth/users.api.handlers';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return handleGetUser(request, id);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return handleUpdateUser(request, id);
}
