import { NextRequest } from 'next/server';
import { handleAssignTool } from '@/features/ai-experience/ai-experience.api.handlers';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return handleAssignTool(request, context);
}
