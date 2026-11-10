import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import { handleGetTemplate } from '@/features/prompt-templates/prompt-template.api.handlers';

export const GET = withPermission('prompts:view', async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return handleGetTemplate(request, context);
});
