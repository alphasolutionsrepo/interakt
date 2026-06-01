// app/api/ai-providers/[id]/disable/route.ts

import { handleDisableProvider } from '@/features/ai-providers/ai-providers.api.handlers';

export const PATCH = handleDisableProvider;