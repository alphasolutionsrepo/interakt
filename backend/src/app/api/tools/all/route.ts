import { forPickers } from '@/features/access/picker-reads';
import { handleGetAllActiveTools } from '@/features/tools/tools.api.handlers';

export const GET = forPickers('tools', 'tools', async function GET() {
  return handleGetAllActiveTools();
});
