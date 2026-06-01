// app/api/ai-providers/enabled/route.ts

import { handleGetEnabledProviders } from '@/features/ai-providers/ai-providers.api.handlers';

export const GET = handleGetEnabledProviders;