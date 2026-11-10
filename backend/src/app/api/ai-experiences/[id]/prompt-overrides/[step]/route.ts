import { NextRequest } from 'next/server';

import { forBuiltInChange } from '@/features/access/built-in';

import { handleRemoveExperienceOverride } from '@/features/prompt-templates/prompt-template.api.handlers';

export const DELETE = forBuiltInChange('ai-experience', 'ai-experiences:edit', async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; step: string }> },
) {
  return handleRemoveExperienceOverride(request, context);
});
