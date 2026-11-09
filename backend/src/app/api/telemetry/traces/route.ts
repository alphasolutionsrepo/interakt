// app/api/telemetry/traces/route.ts

import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import { handleGetSpans, handleDeleteAllSpans } from '@/features/telemetry/telemetry.api.handlers';
import { withRateLimit } from '@/shared/api/rate-limit';

export const GET = withPermission('analytics:view', withRateLimit(
  async (request: NextRequest) => handleGetSpans(request),
  { maxRequests: 60, windowMs: 60_000 }
));

export const DELETE = withPermission('analytics:manage', withRateLimit(
  async () => handleDeleteAllSpans(),
  { maxRequests: 5, windowMs: 60_000 }
));
