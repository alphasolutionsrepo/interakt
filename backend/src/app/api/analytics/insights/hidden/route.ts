// app/api/analytics/insights/hidden/route.ts

import { NextRequest } from 'next/server';

import { handleHideFinding, handleUnhideFinding } from '@/features/analytics/analytics.api.handlers';

/** Hide a "What needs attention" finding for some days */
export async function POST(request: NextRequest) {
  return handleHideFinding(request);
}

/** Show a hidden finding again */
export async function DELETE(request: NextRequest) {
  return handleUnhideFinding(request);
}
