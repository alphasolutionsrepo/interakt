// app/api/health/route.ts

import { NextRequest } from 'next/server';
import { handleGetSystemHealth } from '@/features/health/health.api.handlers';

export async function GET(request: NextRequest) {
  return handleGetSystemHealth(request);
}
