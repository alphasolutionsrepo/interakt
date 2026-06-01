// app/api/ai-providers/key/[providerKey]/route.ts

import { handleGetProviderByKey } from '@/features/ai-providers/ai-providers.api.handlers';

export const GET = handleGetProviderByKey;