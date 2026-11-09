// app/api/jobs/types/route.ts

import { withPermission } from '@/features/access/route-guard';
import { handleGetJobTypes } from '@/features/jobs/jobs.api.handlers';

export const GET = withPermission('settings:view', async function GET() {
  return handleGetJobTypes();
});
