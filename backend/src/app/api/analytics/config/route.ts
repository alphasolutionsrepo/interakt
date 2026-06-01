// app/api/analytics/config/route.ts

import { handleGetConfig, handleUpdateConfig } from '@/features/analytics/analytics.api.handlers';
import type { NextRequest } from 'next/server';

export async function GET() {
  return handleGetConfig();
}

export async function PUT(request: NextRequest) {
  return handleUpdateConfig(request);
}
