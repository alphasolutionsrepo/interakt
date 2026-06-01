import { handleGetSystemDefaults } from '@/features/prompt-templates/prompt-template.api.handlers';

export async function GET() {
  return handleGetSystemDefaults();
}
