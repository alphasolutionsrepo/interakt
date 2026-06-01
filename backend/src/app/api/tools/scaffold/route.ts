import { NextRequest } from 'next/server';
import { handleScaffoldTools } from '@/features/tools/tools.api.handlers';

export async function POST(request: NextRequest) {
  return handleScaffoldTools(request);
}
