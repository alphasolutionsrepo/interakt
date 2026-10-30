// app/api/dashboard/home/tips/route.ts

import { NextRequest } from 'next/server';

import { handleDismissTip } from '@/features/dashboard/home.api.handlers';

/** Dismiss a home page tip for good */
export async function POST(request: NextRequest) {
  return handleDismissTip(request);
}
