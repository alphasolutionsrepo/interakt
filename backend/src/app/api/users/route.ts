// app/api/users/route.ts

import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import {
  handleListUsers,
  handleCreateUser,
} from '@/features/auth/users.api.handlers';

export const GET = withPermission('users:manage', async function GET(request: NextRequest) {
  return handleListUsers(request);
});

export const POST = withPermission('users:manage', async function POST(request: NextRequest) {
  return handleCreateUser(request);
});
