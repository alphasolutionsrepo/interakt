import { withPermission } from '@/features/access/route-guard';
import { handleGetAllActiveTools } from '@/features/tools/tools.api.handlers';

export const GET = withPermission('tools:view', async function GET() {
  return handleGetAllActiveTools();
});
