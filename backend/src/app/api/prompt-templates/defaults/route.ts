import { PICKER_READERS } from '@/features/access/permissions';
import { withPermission } from '@/features/access/route-guard';
import { handleGetSystemDefaults } from '@/features/prompt-templates/prompt-template.api.handlers';

export const GET = withPermission(PICKER_READERS.prompts, async function GET() {
  return handleGetSystemDefaults();
});
