// app/api/ai-providers/key/[providerKey]/route.ts

import { withPermission } from '@/features/access/route-guard';
import { handleGetProviderByKey } from '@/features/ai-providers/ai-providers.api.handlers';

export const GET = withPermission('ai-providers:view', handleGetProviderByKey);