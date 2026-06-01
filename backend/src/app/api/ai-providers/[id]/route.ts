// app/api/ai-providers/[id]/route.ts

import {
  handleGetProvider,
  handleUpdateProvider,
  handleDeleteProvider,
} from '@/features/ai-providers/ai-providers.api.handlers';

export const GET = handleGetProvider;
export const PUT = handleUpdateProvider;
export const DELETE = handleDeleteProvider;