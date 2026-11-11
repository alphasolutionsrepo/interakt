import { forPickers } from '@/features/access/picker-reads';
import { handleGetSystemDefaults } from '@/features/prompt-templates/prompt-template.api.handlers';

export const GET = forPickers('prompts', 'prompts', async function GET() {
  return handleGetSystemDefaults();
}, { byStep: true });
