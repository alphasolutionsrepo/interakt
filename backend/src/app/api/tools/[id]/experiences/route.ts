import { NextRequest } from 'next/server';
import { handleGetToolExperiences } from '@/features/tools/tools.api.handlers';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return handleGetToolExperiences(request, context);
}
