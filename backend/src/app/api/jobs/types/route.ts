// app/api/jobs/types/route.ts

import { handleGetJobTypes } from '@/features/jobs/jobs.api.handlers';

export async function GET() {
  return handleGetJobTypes();
}
