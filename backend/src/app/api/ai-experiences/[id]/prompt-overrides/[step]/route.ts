import { NextRequest } from 'next/server';

import { withPermission } from '@/features/access/route-guard';
import { handleRemoveExperienceOverride } from '@/features/prompt-templates/prompt-template.api.handlers';

export const DELETE = withPermission('ai-experiences:edit', async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; step: string }> },
) {
  return handleRemoveExperienceOverride(request, context);
});
