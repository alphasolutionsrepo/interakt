// app/api/ai-provider-models/route.ts

import { handleListModels, handleCreateModel } from '@/features/ai-providers/ai-providers.api.handlers';

export const GET = handleListModels;
export const POST = handleCreateModel;