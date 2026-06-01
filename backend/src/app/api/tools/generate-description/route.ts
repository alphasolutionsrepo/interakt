import { NextRequest } from 'next/server';
import { handleGenerateDescription } from '@/features/tools/tools.api.handlers';

export async function POST(request: NextRequest) {
  return handleGenerateDescription(request);
}
