// app/api/dashboard/home/route.ts

import { NextRequest } from 'next/server';

import { handleGetHome } from '@/features/dashboard/home.api.handlers';

export async function GET(request: NextRequest) {
  return handleGetHome(request);
}
