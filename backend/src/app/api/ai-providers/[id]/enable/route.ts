// app/api/ai-providers/[id]/enable/route.ts

import { withPermission } from '@/features/access/route-guard';
import { handleEnableProvider } from '@/features/ai-providers/ai-providers.api.handlers';

export const PATCH = withPermission('ai-providers:manage', handleEnableProvider);