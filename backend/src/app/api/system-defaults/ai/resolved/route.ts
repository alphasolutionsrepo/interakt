// app/api/system-defaults/ai/resolved/route.ts

import { handleGetResolvedDefaults } from '@/features/ai-providers/ai-providers.api.handlers';

export const GET = handleGetResolvedDefaults;