// app/api/ai-providers/route.ts

import { handleListProviders, handleCreateProvider } from '@/features/ai-providers/ai-providers.api.handlers';

export const GET = handleListProviders;
export const POST = handleCreateProvider;