import { PICKER_READERS } from '@/features/access/permissions';
import { withPermission } from '@/features/access/route-guard';
import { handleGetAllActiveTools } from '@/features/tools/tools.api.handlers';

export const GET = withPermission(PICKER_READERS.tools, async function GET() {
  return handleGetAllActiveTools();
});
