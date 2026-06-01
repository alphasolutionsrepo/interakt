import { NextRequest } from 'next/server';
import { handleListDocuments } from '@/features/knowledge-base/knowledge-base.api.handlers';

export async function GET(request: NextRequest) {
  return handleListDocuments(request);
}
