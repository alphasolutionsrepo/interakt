import { NextRequest } from 'next/server';
import { handleRollback } from '@/features/prompt-templates/prompt-template.api.handlers';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return handleRollback(request, context);
}
