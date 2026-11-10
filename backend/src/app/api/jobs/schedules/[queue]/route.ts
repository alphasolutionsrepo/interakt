// app/api/jobs/schedules/[queue]/route.ts

import { withPermission } from '@/features/access/route-guard';
import { handleDeleteSchedule } from '@/features/jobs/jobs.api.handlers';

export const DELETE = withPermission('jobs:run', async function DELETE(
  _request: Request,
  context: { params: Promise<{ queue: string }> }
) {
  const { queue } = await context.params;
  return handleDeleteSchedule(queue);
});
