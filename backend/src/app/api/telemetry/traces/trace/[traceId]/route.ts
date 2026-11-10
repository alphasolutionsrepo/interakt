// app/api/telemetry/traces/trace/[traceId]/route.ts

import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import { handleGetTraceSpans } from '@/features/telemetry/telemetry.api.handlers';
import { withRateLimit } from '@/shared/api/rate-limit';

export const GET = withPermission('analytics:view', withRateLimit(
  async (request: NextRequest, { params }: { params: Promise<{ traceId: string }> }) => {
    const { traceId } = await params;
    return handleGetTraceSpans(request, traceId);
  },
  { maxRequests: 60, windowMs: 60_000 }
));
