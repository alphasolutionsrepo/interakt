// app/api/ai-providers/[id]/disable/route.ts

import { withPermission } from '@/features/access/route-guard';
import { handleDisableProvider } from '@/features/ai-providers/ai-providers.api.handlers';

export const PATCH = withPermission('ai-providers:manage', handleDisableProvider);