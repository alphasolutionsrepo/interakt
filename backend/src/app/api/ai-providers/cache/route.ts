// app/api/ai-providers/cache/route.ts

import { handleClearCache, handleGetCacheStats } from '@/features/ai-providers/ai-providers.api.handlers';

export const GET = handleGetCacheStats;
export const POST = handleClearCache;