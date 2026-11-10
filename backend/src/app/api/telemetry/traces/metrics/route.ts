// app/api/telemetry/traces/metrics/route.ts

import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import { handleGetSpanMetrics } from '@/features/telemetry/telemetry.api.handlers';
import { withRateLimit } from '@/shared/api/rate-limit';

export const GET = withPermission('analytics:view', withRateLimit(
  async (request: NextRequest) => handleGetSpanMetrics(request),
  { maxRequests: 30, windowMs: 60_000 }
));
