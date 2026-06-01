import { NextRequest } from 'next/server';
import {
  handleUpdateToolAssignment,
  handleRemoveToolAssignment,
} from '@/features/ai-experience/ai-experience.api.handlers';

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string; toolId: string }> }
) {
  return handleUpdateToolAssignment(request, context);
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; toolId: string }> }
) {
  return handleRemoveToolAssignment(request, context);
}
