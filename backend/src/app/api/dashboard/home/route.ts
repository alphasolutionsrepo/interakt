// app/api/dashboard/home/route.ts

import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import { handleGetHome } from '@/features/dashboard/home.api.handlers';

export const GET = withPermission('signed-in', async function GET(request: NextRequest) {
  return handleGetHome(request);
});
