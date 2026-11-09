import { withPermission } from '@/features/access/route-guard';
import { handleGetSystemDefaults } from '@/features/prompt-templates/prompt-template.api.handlers';

export const GET = withPermission('prompts:view', async function GET() {
  return handleGetSystemDefaults();
});
