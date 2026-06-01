import { NextRequest } from 'next/server';
import { handleUploadDocument } from '@/features/knowledge-base/knowledge-base.api.handlers';

export async function POST(request: NextRequest) {
  return handleUploadDocument(request);
}
