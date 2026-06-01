// app/api/health/database/route.ts

import { NextRequest } from 'next/server';
import { handleGetDatabaseHealth } from '@/features/health/health.api.handlers';

export async function GET(request: NextRequest) {
  return handleGetDatabaseHealth(request);
}
