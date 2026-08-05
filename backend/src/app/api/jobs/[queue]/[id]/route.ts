// app/api/jobs/[queue]/[id]/route.ts

import { NextRequest } from 'next/server';

import {
  handleGetJob,
  handleJobAction,
} from '@/features/jobs/jobs.api.handlers';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ queue: string; id: string }> }
) {
  const { queue, id } = await context.params;
  return handleGetJob(queue, id);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ queue: string; id: string }> }
) {
  const { queue, id } = await context.params;
  return handleJobAction(queue, id, request);
}
