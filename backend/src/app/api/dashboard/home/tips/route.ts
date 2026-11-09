// app/api/dashboard/home/tips/route.ts

import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import { handleDismissTip } from '@/features/dashboard/home.api.handlers';

/** Dismiss a home page tip for good */
export const POST = withPermission('analytics:manage', async function POST(request: NextRequest) {
  return handleDismissTip(request);
});
