// app/api/ai-provider-models/[id]/route.ts

import {
    handleGetModel,
    handleUpdateModel,
    handleDeleteModel,
} from '@/features/ai-providers/ai-providers.api.handlers';

export const GET = handleGetModel;
export const PUT = handleUpdateModel;
export const DELETE = handleDeleteModel;