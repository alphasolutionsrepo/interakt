// app/api/ai-provider-models/[id]/route.ts

import { withPermission } from '@/features/access/route-guard';
import {
    handleGetModel,
    handleUpdateModel,
    handleDeleteModel,
} from '@/features/ai-providers/ai-providers.api.handlers';

export const GET = withPermission('ai-providers:view', handleGetModel);
export const PUT = withPermission('ai-providers:manage', handleUpdateModel);
export const DELETE = withPermission('ai-providers:manage', handleDeleteModel);