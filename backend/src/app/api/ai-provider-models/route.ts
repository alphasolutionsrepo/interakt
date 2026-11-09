// app/api/ai-provider-models/route.ts

import { AI_MODEL_READERS } from '@/features/access/permissions';
import { withPermission } from '@/features/access/route-guard';
import { handleListModels, handleCreateModel } from '@/features/ai-providers/ai-providers.api.handlers';

export const GET = withPermission(AI_MODEL_READERS, handleListModels);
export const POST = withPermission('ai-providers:manage', handleCreateModel);