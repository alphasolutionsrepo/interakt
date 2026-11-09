// app/api/ai-providers/route.ts

import { AI_MODEL_READERS } from '@/features/access/permissions';
import { withPermission } from '@/features/access/route-guard';
import { handleListProviders, handleCreateProvider } from '@/features/ai-providers/ai-providers.api.handlers';

export const GET = withPermission(AI_MODEL_READERS, handleListProviders);
export const POST = withPermission('ai-providers:manage', handleCreateProvider);