// app/api/analytics/config/route.ts

import type { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import { handleGetConfig, handleUpdateConfig } from '@/features/analytics/analytics.api.handlers';

export const GET = withPermission('analytics:view', async function GET() {
  return handleGetConfig();
});

export const PUT = withPermission('analytics:manage', async function PUT(request: NextRequest) {
  return handleUpdateConfig(request);
});
