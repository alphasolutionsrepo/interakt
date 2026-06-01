import { NextRequest } from 'next/server';
import { handleListMemories, handleDeleteAllMemories } from '@/features/user-memories/user-memories.api.handlers';

export async function GET(request: NextRequest) {
  return handleListMemories(request);
}

export async function DELETE(request: NextRequest) {
  return handleDeleteAllMemories(request);
}
