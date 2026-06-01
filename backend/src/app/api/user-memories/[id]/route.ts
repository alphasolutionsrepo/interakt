import { NextRequest } from 'next/server';
import { handleDeleteMemory } from '@/features/user-memories/user-memories.api.handlers';

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return handleDeleteMemory(request, context);
}
