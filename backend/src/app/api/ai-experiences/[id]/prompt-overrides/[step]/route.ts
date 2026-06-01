import { NextRequest } from 'next/server';
import { handleRemoveExperienceOverride } from '@/features/prompt-templates/prompt-template.api.handlers';

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; step: string }> },
) {
  return handleRemoveExperienceOverride(request, context);
}
