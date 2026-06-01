import { NextRequest } from 'next/server';
import { handleGetVersionHistory } from '@/features/prompt-templates/prompt-template.api.handlers';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return handleGetVersionHistory(request, context);
}
