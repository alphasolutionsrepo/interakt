// app/api/ai-providers/[id]/enable/route.ts

import { handleEnableProvider } from '@/features/ai-providers/ai-providers.api.handlers';

export const PATCH = handleEnableProvider;