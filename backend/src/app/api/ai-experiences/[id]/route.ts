import { NextRequest } from 'next/server';
import {
  handleGetAIExperience,
  handleUpdateAIExperience,
  handleDeleteAIExperience,
} from '@/features/ai-experience/ai-experience.api.handlers';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return handleGetAIExperience(request, context);
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return handleUpdateAIExperience(request, context);
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return handleDeleteAIExperience(request, context);
}
