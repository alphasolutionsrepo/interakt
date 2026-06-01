import { handleGetAllActiveTools } from '@/features/tools/tools.api.handlers';

export async function GET() {
  return handleGetAllActiveTools();
}
