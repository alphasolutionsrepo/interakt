import { NextRequest } from 'next/server';
import { handleUpdateHealth, handlePerformHealthCheck } from '@/features/data-source/data-source.api.handlers';
import { withRateLimit } from '@/shared/api/rate-limit';

// PUT: Manually set health status (external systems reporting in)
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return handleUpdateHealth(request, context);
}

// POST: Perform an active health check probe (rate limited: 6 per minute per IP)
export const POST = withRateLimit(
  async function POST(
    request: NextRequest,
    context: { params: Promise<{ id: string }> },
  ) {
    return handlePerformHealthCheck(request, context);
  },
  { maxRequests: 6, windowMs: 60_000 },
);
