import { NextRequest } from 'next/server';
import {
  handleListExperienceOverrides,
  handleSetExperienceOverride,
} from '@/features/prompt-templates/prompt-template.api.handlers';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return handleListExperienceOverrides(request, context);
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return handleSetExperienceOverride(request, context);
}
