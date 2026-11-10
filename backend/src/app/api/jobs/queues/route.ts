// app/api/jobs/queues/route.ts

import { withPermission } from '@/features/access/route-guard';
import { handleGetQueues } from '@/features/jobs/jobs.api.handlers';

export const GET = withPermission('settings:view', async function GET() {
  return handleGetQueues();
});
