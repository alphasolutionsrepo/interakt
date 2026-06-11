// app/api/jobs/queues/route.ts

import { handleGetQueues } from '@/features/jobs/jobs.api.handlers';

export async function GET() {
  return handleGetQueues();
}
