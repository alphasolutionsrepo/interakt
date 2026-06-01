// app/api/telemetry/traces/route.ts

import { NextRequest } from 'next/server';
import { handleGetSpans, handleDeleteAllSpans } from '@/features/telemetry/telemetry.api.handlers';
import { withRateLimit } from '@/shared/api/rate-limit';

export const GET = withRateLimit(
  async (request: NextRequest) => handleGetSpans(request),
  { maxRequests: 60, windowMs: 60_000 }
);

export const DELETE = withRateLimit(
  async () => handleDeleteAllSpans(),
  { maxRequests: 5, windowMs: 60_000 }
);
