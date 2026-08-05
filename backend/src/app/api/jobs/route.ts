// app/api/jobs/route.ts

import { NextRequest } from 'next/server';

import {
  handleListJobs,
  handleEnqueueJob,
} from '@/features/jobs/jobs.api.handlers';

export async function GET(request: NextRequest) {
  return handleListJobs(request);
}

export async function POST(request: NextRequest) {
  return handleEnqueueJob(request);
}
