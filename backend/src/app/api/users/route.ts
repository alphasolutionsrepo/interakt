// app/api/users/route.ts

import { NextRequest } from 'next/server';
import {
  handleListUsers,
  handleCreateUser,
} from '@/features/auth/users.api.handlers';

export async function GET(request: NextRequest) {
  return handleListUsers(request);
}

export async function POST(request: NextRequest) {
  return handleCreateUser(request);
}
