// app/api/analytics/insights/hidden/route.ts

import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import { handleHideFinding, handleUnhideFinding } from '@/features/analytics/analytics.api.handlers';

/** Hide a "What needs attention" finding for some days */
export const POST = withPermission('analytics:manage', async function POST(request: NextRequest) {
  return handleHideFinding(request);
});

/** Show a hidden finding again */
export const DELETE = withPermission('analytics:manage', async function DELETE(request: NextRequest) {
  return handleUnhideFinding(request);
});
