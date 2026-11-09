// app/api/ai-provider-models/route.ts

import { withPermission } from '@/features/access/route-guard';
import { handleListModels, handleCreateModel } from '@/features/ai-providers/ai-providers.api.handlers';

export const GET = withPermission('ai-providers:view', handleListModels);
export const POST = withPermission('ai-providers:manage', handleCreateModel);