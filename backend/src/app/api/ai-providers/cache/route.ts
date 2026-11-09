// app/api/ai-providers/cache/route.ts

import { withPermission } from '@/features/access/route-guard';
import { handleClearCache, handleGetCacheStats } from '@/features/ai-providers/ai-providers.api.handlers';

export const GET = withPermission('settings:view', handleGetCacheStats);
export const POST = withPermission('settings:manage', handleClearCache);