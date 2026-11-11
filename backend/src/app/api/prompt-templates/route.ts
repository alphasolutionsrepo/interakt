import { NextRequest } from 'next/server';

import { forPickers } from '@/features/access/picker-reads';
import { withPermission } from '@/features/access/route-guard';
import {
  handleListTemplates,
  handleCreateVersion,
} from '@/features/prompt-templates/prompt-template.api.handlers';

export const GET = forPickers('prompts', 'prompts', async function GET(request: NextRequest) {
  return handleListTemplates(request);
});

export const POST = withPermission('prompts:edit', async function POST(request: NextRequest) {
  return handleCreateVersion(request);
});
