import { NextRequest } from 'next/server';

import { forExperienceChange } from '@/features/access/built-in-experiences';
import { handleRemoveExperienceOverride } from '@/features/prompt-templates/prompt-template.api.handlers';

export const DELETE = forExperienceChange('ai', async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; step: string }> },
) {
  return handleRemoveExperienceOverride(request, context);
});
