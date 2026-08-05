// app/api/jobs/schedules/[queue]/route.ts

import { handleDeleteSchedule } from '@/features/jobs/jobs.api.handlers';

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ queue: string }> }
) {
  const { queue } = await context.params;
  return handleDeleteSchedule(queue);
}
