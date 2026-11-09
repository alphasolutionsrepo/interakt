// app/api/telemetry/traces/[spanId]/route.ts

import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import { handleGetSpanById, handleDeleteSpan } from '@/features/telemetry/telemetry.api.handlers';
import { withRateLimit } from '@/shared/api/rate-limit';

export const GET = withPermission('analytics:view', withRateLimit(
  async (request: NextRequest, { params }: { params: Promise<{ spanId: string }> }) => {
    const { spanId } = await params;
    return handleGetSpanById(request, spanId);
  },
  { maxRequests: 60, windowMs: 60_000 }
));

export const DELETE = withPermission('analytics:manage', withRateLimit(
  async (request: NextRequest, { params }: { params: Promise<{ spanId: string }> }) => {
    const { spanId } = await params;
    return handleDeleteSpan(request, spanId);
  },
  { maxRequests: 10, windowMs: 60_000 }
));
