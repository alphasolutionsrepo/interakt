import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import { handleRollback } from '@/features/prompt-templates/prompt-template.api.handlers';

export const POST = withPermission('prompts:edit', async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return handleRollback(request, context);
});
